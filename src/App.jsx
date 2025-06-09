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

    const loader = new GLTFLoader();

    const init = async () => {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera();
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.xr.enabled = true;
      containerRef.current.appendChild(renderer.domElement);

      // AR Button with Hit Test and back camera preference
      document.body.appendChild(createARButton(renderer, onSelect, {
        optionalFeatures: ['hit-test'],
        requiredFeatures: ['local'],
        // Request back camera specifically
        cameraPreference: 'environment'
      }));

      const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
      scene.add(light);

      // Create reticle (targeting indicator)
      const reticleGeometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
      const reticleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
      reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
      reticle.matrixAutoUpdate = false;
      reticle.visible = false;
      scene.add(reticle);

      controller = renderer.xr.getController(0);
      controller.addEventListener('select', onSelect);
      scene.add(controller);

      renderer.setAnimationLoop(render);
    };

    const render = (timestamp, frame) => {
      if (frame) {
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
            // Store the hit result for placement
            renderer.xr.hitResult = hit;
            
            // Show and position the reticle
            reticle.visible = true;
            reticle.matrix.fromArray(hit.getPose(session.getReferenceSpace()).transform.matrix);
          } else {
            reticle.visible = false;
          }
        }
      }

      renderer.render(scene, camera);
    };

    const onSelect = async () => {
      if (!modelUrl) return;

      const session = renderer.xr.getSession();
      if (!session || !renderer.xr.hitResult) return;

      // Get the hit test result
      const hitPose = renderer.xr.hitResult.getPose(session.getReferenceSpace());
      
      if (hitPose) {
        loader.load(modelUrl, (gltf) => {
          // Remove previous model if exists
          if (model) {
            scene.remove(model);
          }
          
          model = gltf.scene;
          model.scale.set(0.5, 0.5, 0.5);
          
          // Set position based on hit test coordinates
          const position = new THREE.Vector3();
          const quaternion = new THREE.Quaternion();
          const matrix = new THREE.Matrix4();
          
          matrix.fromArray(hitPose.transform.matrix);
          matrix.decompose(position, quaternion, new THREE.Vector3());
          
          model.position.copy(position);
          model.quaternion.copy(quaternion);
          
          // Add slight offset to place on surface
          model.position.y += 0.01;
          
          scene.add(model);
          
          console.log('Model placed at coordinates:', {
            x: position.x.toFixed(3),
            y: position.y.toFixed(3),
            z: position.z.toFixed(3)
          });
        });
      }
    };

    init();

    return () => {
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
      <div ref={containerRef} />
      <label className="upload">
        Upload .glb
        <input type="file" accept=".glb" onChange={handleUpload} hidden />
      </label>
    </>
  );
}

export default App;