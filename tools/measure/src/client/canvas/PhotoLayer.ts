// Renders photo on a Canvas with pan/zoom support

export class PhotoLayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private image: HTMLImageElement | null = null;

  // Transform state
  private offsetX = 0;
  private offsetY = 0;
  private scale = 1;

  // Pan state
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;
  private spaceDown = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.setupEvents();
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
    this.scale = Math.min(scaleX, scaleY) * 0.9;
    this.offsetX = (this.canvas.width - this.image.width * this.scale) / 2;
    this.offsetY = (this.canvas.height - this.image.height * this.scale) / 2;
  }

  render(): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.image) {
      ctx.save();
      ctx.translate(this.offsetX, this.offsetY);
      ctx.scale(this.scale, this.scale);
      ctx.drawImage(this.image, 0, 0);
      ctx.restore();
    }
  }

  // Convert screen coordinates to image pixel coordinates
  screenToImage(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.offsetX) / this.scale,
      y: (screenY - this.offsetY) / this.scale,
    };
  }

  // Convert image coordinates to screen coordinates
  imageToScreen(imgX: number, imgY: number): { x: number; y: number } {
    return {
      x: imgX * this.scale + this.offsetX,
      y: imgY * this.scale + this.offsetY,
    };
  }

  getTransform() {
    return { offsetX: this.offsetX, offsetY: this.offsetY, scale: this.scale };
  }

  getImageSize() {
    return this.image
      ? { width: this.image.width, height: this.image.height }
      : { width: 0, height: 0 };
  }

  private setupEvents(): void {
    // Zoom with scroll wheel
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Zoom centered on cursor
      this.offsetX = mx - (mx - this.offsetX) * factor;
      this.offsetY = my - (my - this.offsetY) * factor;
      this.scale *= factor;

      this.render();
      this.canvas.dispatchEvent(new CustomEvent('transform-change'));
    });

    // Pan with space+drag or middle-click
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') this.spaceDown = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.spaceDown = false;
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.spaceDown || e.button === 1) {
        this.isPanning = true;
        this.panStartX = e.clientX - this.offsetX;
        this.panStartY = e.clientY - this.offsetY;
        this.canvas.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (this.isPanning) {
        this.offsetX = e.clientX - this.panStartX;
        this.offsetY = e.clientY - this.panStartY;
        this.render();
        this.canvas.dispatchEvent(new CustomEvent('transform-change'));
      }
    });

    window.addEventListener('pointerup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.canvas.style.cursor = '';
      }
    });
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    if (this.image) this.fitToCanvas();
    this.render();
  }
}
