export function createARButton(renderer, onSelect, options = {}) {
  const button = document.createElement('button');
  button.style.position = 'absolute';
  button.style.bottom = '20px';
  button.style.left = '50%';
  button.style.transform = 'translateX(-50%)';
  button.style.padding = '12px 24px';
  button.style.backgroundColor = '#000';
  button.style.color = '#fff';
  button.style.border = 'none';
  button.style.borderRadius = '6px';
  button.style.fontSize = '16px';
  button.style.cursor = 'pointer';
  button.style.zIndex = '1000';
  button.textContent = 'START AR';

  let videoElement = null;
  let stream = null;

  button.addEventListener('click', async () => {
    if (button.textContent === 'START AR') {
      try {
        // First try WebXR if available
        if (navigator.xr) {
          try {
            const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
            if (isSupported) {
              const sessionOptions = {
                requiredFeatures: options.requiredFeatures || ['local'],
                optionalFeatures: options.optionalFeatures || ['hit-test'],
                environmentBlendMode: 'alpha-blend',
                ...options
              };

              const session = await navigator.xr.requestSession('immersive-ar', sessionOptions);
              await renderer.xr.setSession(session);
              
              console.log('AR session started with WebXR');
              button.textContent = 'STOP AR';
              
              session.addEventListener('end', () => {
                button.textContent = 'START AR';
              });
              return;
            }
          } catch (webxrError) {
            console.log('WebXR AR failed, falling back to camera:', webxrError);
          }
        }

        // Fallback: Access back camera directly
        console.log('Starting camera fallback mode');
        
        // Request back camera
        const constraints = {
          video: {
            facingMode: { exact: "environment" }, // Back camera
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        };

        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (exactError) {
          // If exact back camera fails, try preferred back camera
          console.log('Exact back camera failed, trying preferred:', exactError);
          const fallbackConstraints = {
            video: {
              facingMode: "environment", // Preferred back camera
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          };
          stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
        }

        // Create video element for camera feed
        videoElement = document.createElement('video');
        videoElement.srcObject = stream;
        videoElement.style.position = 'fixed';
        videoElement.style.top = '0';
        videoElement.style.left = '0';
        videoElement.style.width = '100vw';
        videoElement.style.height = '100vh';
        videoElement.style.objectFit = 'cover';
        videoElement.style.zIndex = '-1';
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        
        document.body.appendChild(videoElement);
        
        // Make the renderer background transparent
        renderer.domElement.style.background = 'transparent';
        
        console.log('Camera started successfully');
        button.textContent = 'STOP AR';

      } catch (error) {
        console.error('Failed to start camera:', error);
        
        // More user-friendly error messages
        let errorMessage = 'Failed to access camera. ';
        if (error.name === 'NotAllowedError') {
          errorMessage += 'Please allow camera permissions and try again.';
        } else if (error.name === 'NotFoundError') {
          errorMessage += 'No camera found on this device.';
        } else if (error.name === 'NotSupportedError') {
          errorMessage += 'Camera not supported in this browser.';
        } else {
          errorMessage += 'Please check camera permissions.';
        }
        
        alert(errorMessage);
      }
    } else {
      // Stop AR/Camera
      try {
        // Stop WebXR session if active
        if (renderer.xr.getSession()) {
          renderer.xr.getSession().end();
        }
        
        // Stop camera stream
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          stream = null;
        }
        
        // Remove video element
        if (videoElement) {
          document.body.removeChild(videoElement);
          videoElement = null;
        }
        
        // Reset renderer background
        renderer.domElement.style.background = '';
        
        button.textContent = 'START AR';
        console.log('AR/Camera stopped');
      } catch (error) {
        console.error('Error stopping AR/Camera:', error);
        button.textContent = 'START AR';
      }
    }
  });

  return button;
}