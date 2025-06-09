// Fixed App.jsx - Corrected surface detection implementation

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { createARButton } from './ARButton';

function App() {       
  const containerRef = useRef();
  const [modelUrl, setModelUrl] = useState(null);
  const [sceneReady, setSceneReady] = useState(false);

  useEffect(() => {
    if (!sceneReady) return;

    let renderer, scene, camera, controller;
    let model;
    let hitTestSource = null;
    let hitTestSourceRequested = false;
    let localReferenceSpace = null;
    let viewerReferenceSpace = null; // Add viewer space for hit testing
    let reticle;
    let raycaster, mouse;

    const loader = new GLTFLoader();

    const init = async () => {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.xr.enabled = true;
      containerRef.current.appendChild(renderer.domElement);

      // Initialize raycaster and mouse for fallback mode
      raycaster = new THREE.Raycaster();
      mouse = new THREE.Vector2();

      // AR Button with proper session options
      document.body.appendChild(createARButton(renderer, onSelect, {
        requiredFeatures: ['local', 'hit-test'], // Both required for surface detection
        optionalFeatures: ['anchors', 'dom-overlay'],
        cameraPreference: 'environment'
      }));

      const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight.position.set(0, 1, 1);
      scene.add(light);
      scene.add(directionalLight);

      // Create reticle (targeting indicator) - Fixed geometry
      const reticleGeometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
      const reticleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide // Ensure visibility from both sides
      });
      reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
      reticle.matrixAutoUpdate = false;
      reticle.visible = false;
      scene.add(reticle);

      // XR controller setup
      controller = renderer.xr.getController(0);
      controller.addEventListener('select', onSelect);
      scene.add(controller);

      // Mouse/touch events for fallback mode
      renderer.domElement.addEventListener('click', onCanvasClick);
      renderer.domElement.addEventListener('touchend', onCanvasClick);

      // Position camera for fallback mode
      camera.position.set(0, 1.6, 3);
      camera.lookAt(0, 0, 0);

      // Setup XR session events
      renderer.xr.addEventListener('sessionstart', onXRSessionStart);
      renderer.xr.addEventListener('sessionend', onXRSessionEnd);

      renderer.setAnimationLoop(render);

      // Handle window resize
      window.addEventListener('resize', onWindowResize);
    };

    const onXRSessionStart = async () => {
      console.log('XR Session started');
      hitTestSourceRequested = false;
      hitTestSource = null;
      
      const session = renderer.xr.getSession();
      
      try {
        // Get local reference space for drawing
        localReferenceSpace = await session.requestReferenceSpace('local');
        console.log('Local reference space acquired');
        
        // Get viewer reference space for hit testing - THIS IS CRITICAL
        viewerReferenceSpace = await session.requestReferenceSpace('viewer');
        console.log('Viewer reference space acquired');
        
        // Request hit test source using VIEWER space (not local!)
        hitTestSource = await session.requestHitTestSource({ 
          space: viewerReferenceSpace 
        });
        hitTestSourceRequested = true;
        console.log('Hit test source created successfully');
        
      } catch (error) {
        console.error('Failed to setup XR spaces:', error);
      }
    };

    const onXRSessionEnd = () => {
      console.log('XR Session ended');
      if (hitTestSource) {
        hitTestSource.cancel();
      }
      hitTestSource = null;
      hitTestSourceRequested = false;
      localReferenceSpace = null;
      viewerReferenceSpace = null;
      reticle.visible = false;
    };

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    const onCanvasClick = (event) => {
      // Only handle clicks in fallback mode (not in XR)
      if (renderer.xr.isPresenting) return;

      event.preventDefault();
      
      // Calculate mouse position
      const rect = renderer.domElement.getBoundingClientRect();
      let clientX, clientY;
      
      if (event.type === 'touchend' && event.changedTouches) {
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
      } else {
        clientX = event.clientX;
        clientY = event.clientY;
      }
      
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      // Create a ground plane for intersection
      const groundGeometry = new THREE.PlaneGeometry(100, 100);
      groundGeometry.rotateX(-Math.PI / 2);
      const groundMaterial = new THREE.MeshBasicMaterial({ visible: false });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.position.set(0, 0, 0);
      scene.add(ground);

      // Raycast to find intersection
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(ground);

      if (intersects.length > 0) {
        const intersectionPoint = intersects[0].point;
        placeModel(intersectionPoint);
      }

      scene.remove(ground);
    };

    const render = (timestamp, frame) => {
      if (frame && renderer.xr.isPresenting) {
        // WebXR mode - FIXED hit test logic
        const session = renderer.xr.getSession();
        
        // Check if we have all required components
        if (hitTestSource && localReferenceSpace) {
          try {
            // Get hit test results
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            
            if (hitTestResults.length > 0) {
              // Get the first (closest) hit result
              const hit = hitTestResults[0];
              
              // Get pose relative to local reference space for drawing
              const hitPose = hit.getPose(localReferenceSpace);
              
              if (hitPose) {
                // Store hit result for model placement
                renderer.xr.hitResult = hit;
                renderer.xr.hitPose = hitPose;
                
                // Update reticle position using the pose matrix
                reticle.visible = true;
                reticle.matrix.fromArray(hitPose.transform.matrix);
                
                // Debug: Log hit detection (less frequent logging)
                if (Math.random() < 0.1) { // Log 10% of frames
                  console.log('Surface detected at:', {
                    x: hitPose.transform.position.x.toFixed(3),
                    y: hitPose.transform.position.y.toFixed(3),
                    z: hitPose.transform.position.z.toFixed(3)
                  });
                }
              }
            } else {
              // No surface detected
              reticle.visible = false;
              renderer.xr.hitResult = null;
              renderer.xr.hitPose = null;
            }
          } catch (error) {
            console.error('Hit test error:', error);
            reticle.visible = false;
          }
        } else {
          // Still waiting for hit test source or reference space
          reticle.visible = false;
        }
      } else if (!renderer.xr.isPresenting) {
        // Fallback mode - show reticle at center
        reticle.visible = true;
        reticle.position.set(0, 0, -2);
        reticle.lookAt(camera.position);
      }

      renderer.render(scene, camera);
    };

    const placeModel = (position, orientation = null) => {
      if (!modelUrl) return;

      loader.load(modelUrl, (gltf) => {
        // Remove previous model if exists
        if (model) {
          scene.remove(model);
        }
        
        model = gltf.scene;
        model.scale.set(0.5, 0.5, 0.5);
        
        // Set position
        model.position.copy(position);
        
        // Set orientation if provided (from hit test)
        if (orientation) {
          model.quaternion.copy(orientation);
        }
        
        // Slight offset above surface to prevent z-fighting
        model.position.y += 0.01;
        
        scene.add(model);
        
        console.log('Model placed at coordinates:', {
          x: position.x.toFixed(3),
          y: position.y.toFixed(3),
          z: position.z.toFixed(3)
        });
      }, undefined, (error) => {
        console.error('Error loading model:', error);
      });
    };

    const onSelect = async () => {
      if (!modelUrl) {
        console.log('No model loaded');
        return;
      }

      if (renderer.xr.isPresenting) {
        // WebXR mode - use stored hit result
        if (renderer.xr.hitResult && renderer.xr.hitPose) {
          try {
            const hitPose = renderer.xr.hitPose;
            
            const position = new THREE.Vector3(
              hitPose.transform.position.x,
              hitPose.transform.position.y,
              hitPose.transform.position.z
            );
            
            const orientation = new THREE.Quaternion(
              hitPose.transform.orientation.x,
              hitPose.transform.orientation.y,
              hitPose.transform.orientation.z,
              hitPose.transform.orientation.w
            );
            
            placeModel(position, orientation);
            console.log('Model placed via surface detection');
            
          } catch (error) {
            console.error('Error placing model:', error);
          }
        } else {
          console.log('No surface detected - move device to find a surface');
        }
      }
      // For fallback mode, placement is handled by click/touch events
    };

    init();

    return () => {
      window.removeEventListener('resize', onWindowResize);
      renderer?.domElement.removeEventListener('click', onCanvasClick);
      renderer?.domElement.removeEventListener('touchend', onCanvasClick);
      renderer?.xr?.removeEventListener('sessionstart', onXRSessionStart);
      renderer?.xr?.removeEventListener('sessionend', onXRSessionEnd);
      
      // Clean up hit test source
      if (hitTestSource) {
        hitTestSource.cancel();
      }
      
      renderer?.dispose();
    };
  }, [sceneReady, modelUrl]);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.name.endsWith('.glb')) {
      setModelUrl(URL.createObjectURL(file));
      setSceneReady(true);
    }
  };

  return (
    <>
      <div ref={containerRef} style={{ position: 'relative', width: '100vw', height: '100vh' }} />
      <label 
        className="upload"
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          zIndex: 1000
        }}
      >
        Upload .glb
        <input type="file" accept=".glb" onChange={handleUpload} hidden />
      </label>
      
      {/* Instructions overlay */}
      <div style={{
        position: 'absolute',
        top: '70px',
        left: '20px',
        right: '20px',
        padding: '10px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        borderRadius: '5px',
        fontSize: '14px',
        zIndex: 1000,
        display: sceneReady ? 'block' : 'none'
      }}>
        <strong>Instructions:</strong><br/>
        1. Upload a .glb model<br/>
        2. Start AR and point at a flat surface<br/>
        3. Look for the green reticle (circle)<br/>
        4. Tap screen or trigger to place model
      </div>
      
      {!sceneReady && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: '#333',
          fontSize: '18px'
        }}>
          Please upload a .glb model to start
        </div>
      )}
    </>
  );
}

export default App;