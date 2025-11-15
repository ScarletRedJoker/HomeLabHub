function createStarfield(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  let animationId;
  
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  
  resizeCanvas();
  
  const stars = [];
  const starCount = 50;
  
  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 1.2,
      opacity: Math.random() * 0.6 + 0.2,
      twinkleSpeed: Math.random() * 0.008 + 0.004,
      twinkleDirection: Math.random() > 0.5 ? 1 : -1
    });
  }
  
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    stars.forEach(star => {
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
      ctx.shadowBlur = star.radius * 1.2;
      ctx.shadowColor = `rgba(255, 255, 255, ${star.opacity * 0.5})`;
      ctx.fill();
      
      star.opacity += star.twinkleSpeed * star.twinkleDirection;
      
      if (star.opacity <= 0.1) {
        star.opacity = 0.1;
        star.twinkleDirection = 1;
      } else if (star.opacity >= 1) {
        star.opacity = 1;
        star.twinkleDirection = -1;
      }
    });
    
    animationId = requestAnimationFrame(animate);
  }
  
  animate();
  
  window.addEventListener('resize', () => {
    cancelAnimationFrame(animationId);
    resizeCanvas();
    
    stars.forEach(star => {
      star.x = Math.random() * canvas.width;
      star.y = Math.random() * canvas.height;
    });
    
    animate();
  });
}

document.addEventListener('DOMContentLoaded', function() {
  createStarfield('starfield-canvas');
});
