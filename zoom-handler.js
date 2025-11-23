class ZoomHandler {
  constructor(element) {
    this.element = element;
    if (!this.element) return;
    
    this.scroller = this.element.parentNode; 

    this.finalScale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    
    this.tempScale = 1;
    this.tempOffsetX = 0;
    this.tempOffsetY = 0;

    this.panning = false;
    this.isPanningContent = false;
    
    this.initialDistance = 0;
    this.panStart = null;
    this.pageOrigin = null; 

    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.handleDoubleTap = this.handleDoubleTap.bind(this);

    this.setupZoomEvents();
  }

  setupZoomEvents() {
    const updateTouchAction = () => {
      this.element.style.touchAction = this.finalScale > 1 ? 'none' : 'auto';
    };
    updateTouchAction();
    this.element.style.transformOrigin = '0 0';

    this.element.addEventListener('touchstart', this.handleTouchStart);
    this.element.addEventListener('touchmove', this.handleTouchMove);
    this.element.addEventListener('touchend', (e) => {
      this.handleTouchEnd(e);
      updateTouchAction(); 
    });
    this.element.addEventListener('touchcancel', this.handleTouchEnd);
    this.element.addEventListener('dblclick', this.handleDoubleTap);
  }

  destroy() {
    this.element.removeEventListener('touchstart', this.handleTouchStart);
    this.element.removeEventListener('touchmove', this.handleTouchMove);
    this.element.removeEventListener('touchend', this.handleTouchEnd);
    this.element.removeEventListener('touchcancel', this.handleTouchEnd);
    this.element.removeEventListener('dblclick', this.handleDoubleTap);
  }
  
  getDistance(p1, p2) {
    const dx = p1.clientX - p2.clientX;
    const dy = p1.clientY - p2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  getPageCoordinates(e_touches) {
    if (!this.scroller || !this.scroller.getBoundingClientRect) {
      this.scroller = this.element.parentNode;
      
      if (!this.scroller || !this.scroller.getBoundingClientRect) {
        console.error("ZoomHandler Error: Cannot find scroller parent element.");
        return null; 
      }
    }

    const scrollerRect = this.scroller.getBoundingClientRect();
    const scrollLeft = this.scroller.scrollLeft;
    const scrollTop = this.scroller.scrollTop;

    const screenX = (e_touches[0].clientX + (e_touches[1]?.clientX || e_touches[0].clientX)) / e_touches.length;
    const screenY = (e_touches[0].clientY + (e_touches[1]?.clientY || e_touches[0].clientY)) / e_touches.length;

    const x_in_scroller_viewport = screenX - scrollerRect.left;
    const y_in_scroller_viewport = screenY - scrollerRect.top;

    return {
      x: x_in_scroller_viewport + scrollLeft,
      y: y_in_scroller_viewport + scrollTop
    };
  }

  handleTouchStart(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      
      this.pageOrigin = this.getPageCoordinates(e.touches);
      if (!this.pageOrigin) return; 

      this.panning = true; 
      this.initialDistance = this.getDistance(e.touches[0], e.touches[1]);
      
    } else if (e.touches.length === 1 && this.finalScale > 1) {
      const trueHit = this.getPageCoordinates(e.touches);
      if (!trueHit) return; 

      this.isPanningContent = true;
      this.panStart = {
        x: trueHit.x - this.offsetX,
        y: trueHit.y - this.offsetY,
      };
    }
  }

  handleTouchMove(e) {
    const element = e.currentTarget;

    if (this.panning && e.touches.length === 2) {
      e.preventDefault();
      
      const currentDistance = this.getDistance(e.touches[0], e.touches[1]);
      const gestureRatio = currentDistance / this.initialDistance;
      
      this.tempScale = this.finalScale * gestureRatio;
      this.tempScale = Math.max(0.5, Math.min(this.tempScale, 5));

      const scaleRatio = this.tempScale / this.finalScale;
      this.tempOffsetX = this.pageOrigin.x * (1 - scaleRatio) + this.offsetX * scaleRatio;
      this.tempOffsetY = this.pageOrigin.y * (1 - scaleRatio) + this.offsetY * scaleRatio;

      element.style.transform = `translate(${this.tempOffsetX}px, ${this.tempOffsetY}px) scale(${this.tempScale})`;
    }

    else if (this.isPanningContent && e.touches.length === 1 && this.finalScale > 1) {
      e.preventDefault();
      
      const trueHit = this.getPageCoordinates(e.touches);
      if (!trueHit) return; 
      
      this.tempOffsetX = trueHit.x - this.panStart.x;
      this.tempOffsetY = trueHit.y - this.panStart.y;
      
      element.style.transform = `translate(${this.tempOffsetX}px, ${this.tempOffsetY}px) scale(${this.finalScale})`;
    }
  }
  
  handleTouchEnd(e) {
    if (this.panning) {
      this.panning = false;
      this.finalScale = this.tempScale;
      this.offsetX = this.tempOffsetX;
      this.offsetY = this.tempOffsetY;
      this.pageOrigin = null; 
    }
    if (this.isPanningContent) {
      this.isPanningContent = false;
      this.offsetX = this.tempOffsetX;
      this.offsetY = this.tempOffsetY;
    }
  }

  handleDoubleTap(e) {
    const element = e.currentTarget;
    this.finalScale = 1;
    this.tempScale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.tempOffsetX = 0;
    this.tempOffsetY = 0;
    
    element.style.transition = 'transform 0.25s ease';
    element.style.transformOrigin = '0 0';
    element.style.transform = 'translate(0,0) scale(1)';
    setTimeout(() => {
      element.style.transition = '';
    }, 300);
  }
}
