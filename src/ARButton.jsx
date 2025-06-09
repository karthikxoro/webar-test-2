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

  // Default session options with back camera preference
  const sessionOptions = {
    requiredFeatures: options.requiredFeatures || ['local'],
    optionalFeatures: options.optionalFeatures || ['hit-test'],
    // Request environment (back) camera
    environmentBlendMode: 'alpha-blend',
    ...options
  };

  button.addEventListener('click', async () => {
    if (button.textContent === 'START AR') {
      try {
        // Check if WebXR is supported
        if (!navigator.xr) {
          alert('WebXR is not supported on this device');
          return;
        }

        // Check if AR is supported
        const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
        if (!isSupported) {
          alert('AR is not supported on this device');
          return;
        }

        // Request AR session with back camera preference
        const session = await navigator.xr.requestSession('immersive-ar', sessionOptions);
        
        // Set up the session
        await renderer.xr.setSession(session);
        
        console.log('AR session started with hit test support');

        button.textContent = 'STOP AR';
        
        // Handle session end
        session.addEventListener('end', () => {
          button.textContent = 'START AR';
        });

      } catch (error) {
        console.error('Failed to start AR session:', error);
        alert('Failed to start AR: ' + error.message);
      }
    } else {
      // End AR session
      if (renderer.xr.getSession()) {
        renderer.xr.getSession().end();
      }
    }
  });

  return button;
}