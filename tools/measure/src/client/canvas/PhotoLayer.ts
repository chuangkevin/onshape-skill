// Renders photo on a Canvas with pan/zoom support
// IMPORTANT: Events are attached to a separate eventTarget (drawingCanvas on top)

export class PhotoLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: HTMLImageElement | null = null;

  // Transform state
  private _offsetX = 0;
  private _offsetY = 0;
  private _scale = 1;

  // Pan state
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private spaceDown = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  /** Attach pan/zoom events to a different element (the top canvas) */
  attachEvents(eventTarget: HTMLElement): void {
    // Zoom with scroll wheel
    eventTarget.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = eventTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this._offsetX = mx - (mx - this._offsetX) * factor;
      this._offsetY = my - (my - this._offsetY) * factor;
      this._scale *= factor;
      this.render();
      eventTarget.dispatchEvent(new CustomEvent('transform-change'));
    });

    // Pan with space+drag or middle-click
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        this.spaceDown = true;
        eventTarget.style.cursor = 'grab';
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spaceDown = false;
        if (!this.isPanning) eventTarget.style.cursor = 'crosshair';
      }
    });

    eventTarget.addEventListener('pointerdown', (e) => {
      if (this.spaceDown || e.button === 1 || (e.ctrlKey && e.button === 0)) {
        this.isPanning = true;
        this.panStartX = e.clientX - this._offsetX;
        this.panStartY = e.clientY - this._offsetY;
        eventTarget.style.cursor = 'grabbing';
        e.preventDefault();
        e.stopPropagation(); // Prevent drawing tools from getting this event
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (this.isPanning) {
        this._offsetX = e.clientX - this.panStartX;
        this._offsetY = e.clientY - this.panStartY;
        this.render();
        eventTarget.dispatchEvent(new CustomEvent('transform-change'));
      }
    });

    window.addEventListener('pointerup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        eventTarget.style.cursor = this.spaceDown ? 'grab' : 'crosshair';
      }
    });
  }

  get isPanningNow(): boolean {
    return this.isPanning || this.spaceDown;
  }

  loadImage(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this.fitToCanvas();
        this.render();
        resolve();
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  private fitToCanvas(): void {
    if (!this.image) return;
    const scaleX = this.canvas.width / this.image.width;
    const scaleY = this.canvas.height / this.image.height;
    this._scale = Math.min(scaleX, scaleY) * 0.9;
    this._offsetX = (this.canvas.width - this.image.width * this._scale) / 2;
    this._offsetY = (this.canvas.height - this.image.height * this._scale) / 2;
  }

  render(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (this.image) {
      ctx.save();
      ctx.translate(this._offsetX, this._offsetY);
      ctx.scale(this._scale, this._scale);
      ctx.drawImage(this.image, 0, 0);
      ctx.restore();
    }
  }

  screenToImage(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this._offsetX) / this._scale,
      y: (screenY - this._offsetY) / this._scale,
    };
  }

  imageToScreen(imgX: number, imgY: number): { x: number; y: number } {
    return {
      x: imgX * this._scale + this._offsetX,
      y: imgY * this._scale + this._offsetY,
    };
  }

  getTransform() {
    return { offsetX: this._offsetX, offsetY: this._offsetY, scale: this._scale };
  }

  getImageSize() {
    return this.image
      ? { width: this.image.width, height: this.image.height }
      : { width: 0, height: 0 };
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    if (this.image) this.fitToCanvas();
    this.render();
  }
}
