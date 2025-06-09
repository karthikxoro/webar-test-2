// Fixed App.jsx - Key changes for surface detection

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
    let localReferenceSpace = null; // Store reference space
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

      // AR Button with REQUIRED hit-test feature
      document.body.appendChild(createARButton(renderer, onSelect, {
        requiredFeatures: ['local', 'hit-test'], // Make hit-test required!
        optionalFeatures: ['anchors'],
        cameraPreference: 'environment'
      }));

      const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight.position.set(0, 1, 1);
      scene.add(light);
      scene.add(directionalLight);

      // Create reticle (targeting indicator)
      const reticleGeometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
      const reticleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00, // Green color for better visibility
        transparent: true,
        opacity: 0.8
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
      
      // Get the session and reference space
      const session = renderer.xr.getSession();
      try {
        localReferenceSpace = await session.requestReferenceSpace('local');
        console.log('Local reference space acquired');
      } catch (error) {
        console.error('Failed to get local reference space:', error);
      }
    };

    const onXRSessionEnd = () => {
      console.log('XR Session ended');
      hitTestSource = null;
      hitTestSourceRequested = false;
      localReferenceSpace = null;
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
        
        // Initialize hit test source if not done yet
        if (!hitTestSourceRequested && localReferenceSpace) {
          hitTestSourceRequested = true;
          
          // Request hit test source using local reference space
          session.requestHitTestSource({ space: localReferenceSpace })
            .then((source) => {
              hitTestSource = source;
              console.log('Hit test source created successfully');
            })
            .catch((error) => {
              console.error('Failed to create hit test source:', error);
              hitTestSourceRequested = false; // Allow retry
            });
        }

        // Perform hit testing if source is available
        if (hitTestSource) {
          try {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            
            if (hitTestResults.length > 0) {
              const hit = hitTestResults[0];
              const hitPose = hit.getPose(localReferenceSpace);
              
              if (hitPose) {
                // Store hit result for selection
                renderer.xr.hitResult = hit;
                
                // Update reticle position
                reticle.visible = true;
                reticle.matrix.fromArray(hitPose.transform.matrix);
                
                // Debug: Log hit detection
                console.log('Surface detected at:', {
                  x: hitPose.transform.position.x.toFixed(3),
                  y: hitPose.transform.position.y.toFixed(3),
                  z: hitPose.transform.position.z.toFixed(3)
                });
              }
            } else {
              reticle.visible = false;
              renderer.xr.hitResult = null;
            }
          } catch (error) {
            console.error('Hit test error:', error);
          }
        } else {
          // No hit test source yet
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

    const placeModel = (position) => {
      if (!modelUrl) return;

      loader.load(modelUrl, (gltf) => {
        // Remove previous model if exists
        if (model) {
          scene.remove(model);
        }
        
        model = gltf.scene;
        model.scale.set(0.5, 0.5, 0.5);
        
        model.position.copy(position);
        model.position.y += 0.01; // Slight offset above surface
        
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
      if (!modelUrl) return;

      if (renderer.xr.isPresenting) {
        // WebXR mode - FIXED selection logic
        if (!renderer.xr.hitResult || !localReferenceSpace) {
          console.log('No hit result or reference space available');
          return;
        }

        try {
          const hitPose = renderer.xr.hitResult.getPose(localReferenceSpace);
          
          if (hitPose) {
            const position = new THREE.Vector3(
              hitPose.transform.position.x,
              hitPose.transform.position.y,
              hitPose.transform.position.z
            );
            
            placeModel(position);
          } else {
            console.log('No valid hit pose available');
          }
        } catch (error) {
          console.error('Error placing model:', error);
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