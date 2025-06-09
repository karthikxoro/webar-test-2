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

      // AR Button
      document.body.appendChild(createARButton(renderer, onSelect, {
        optionalFeatures: ['hit-test'],
        requiredFeatures: ['local'],
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
        color: 0xffffff,
        transparent: true,
        opacity: 0.6
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

      renderer.setAnimationLoop(render);

      // Handle window resize
      window.addEventListener('resize', onWindowResize);
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
      if (frame) {
        // WebXR mode
        const session = renderer.xr.getSession();
        
        if (hitTestSourceRequested === false) {
          session.requestReferenceSpace('viewer').then((referenceSpace) => {
            session.requestHitTestSource({ space: referenceSpace }).then((source) => {
              hitTestSource = source;
            });
          });
          hitTestSourceRequested = true;
        }

        if (hitTestSource) {
          const hitTestResults = frame.getHitTestResults(hitTestSource);
          
          if (hitTestResults.length) {
            const hit = hitTestResults[0];
            renderer.xr.hitResult = hit;
            
            reticle.visible = true;
            reticle.matrix.fromArray(hit.getPose(session.getReferenceSpace()).transform.matrix);
          } else {
            reticle.visible = false;
          }
        }
      } else {
        // Fallback mode - show reticle at center
        if (!renderer.xr.isPresenting) {
          reticle.visible = true;
          reticle.position.set(0, 0, -2);
          reticle.lookAt(camera.position);
        }
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
        // WebXR mode
        const session = renderer.xr.getSession();
        if (!session || !renderer.xr.hitResult) return;

        const hitPose = renderer.xr.hitResult.getPose(session.getReferenceSpace());
        
        if (hitPose) {
          const position = new THREE.Vector3();
          const quaternion = new THREE.Quaternion();
          const matrix = new THREE.Matrix4();
          
          matrix.fromArray(hitPose.transform.matrix);
          matrix.decompose(position, quaternion, new THREE.Vector3());
          
          placeModel(position);
        }
      }
      // For fallback mode, placement is handled by click/touch events
    };

    init();

    return () => {
      window.removeEventListener('resize', onWindowResize);
      renderer?.domElement.removeEventListener('click', onCanvasClick);
      renderer?.domElement.removeEventListener('touchend', onCanvasClick);
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