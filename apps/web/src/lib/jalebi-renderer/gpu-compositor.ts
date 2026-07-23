/**
 * GPU Compositor — WebGPU-accelerated effect rendering.
 *
 * Applies color grading, vignette, blur, and other effects
 * using WebGPU compute shaders for real-time performance.
 */
export class GPUCompositor {
  private device: GPUDevice | null = null;
  private pipeline: GPUComputePipeline | null = null;
  private bindGroupLayout: GPUBindGroupLayout | null = null;

  async initialize(): Promise<boolean> {
    if (!navigator.gpu) return false;

    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;

      this.device = await adapter.requestDevice();
      this.bindGroupLayout = this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "read-only", format: "rgba8unorm" } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "writeonly", format: "rgba8unorm" } },
        ],
      });

      // Create color grading shader
      const shaderCode = `
        @group(0) @binding(0) var<uniform> params: vec4f; // contrast, saturation, brightness, _
        @group(0) @binding(1) var inputTex: texture_2d<f32>;
        @group(0) @binding(2) var outputTex: texture_storage_2d<rgba8unorm, write>;

        @compute @workgroup_size(8, 8)
        fn main(@builtin(global_invocation_id) id: vec3u) {
          let pixel = textureLoad(inputTex, id.xy, 0);
          let contrast = params.x;
          let saturation = params.y;
          let brightness = params.z;

          // Contrast
          var r = (pixel.r - 0.5) * contrast + 0.5;
          var g = (pixel.g - 0.5) * contrast + 0.5;
          var b = (pixel.b - 0.5) * contrast + 0.5;

          // Saturation
          let gray = 0.299 * r + 0.587 * g + 0.114 * b;
          r = gray + (r - gray) * saturation;
          g = gray + (g - gray) * saturation;
          b = gray + (b - gray) * saturation;

          // Brightness
          r += brightness;
          g += brightness;
          b += brightness;

          textureStore(outputTex, id.xy, vec4f(clamp(r, 0.0, 1.0), clamp(g, 0.0, 1.0), clamp(b, 0.0, 1.0), pixel.a));
        }
      `;

      this.pipeline = this.device.createComputePipeline({
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
        compute: { module: this.device.createShaderModule({ code: shaderCode }), entryPoint: "main" },
      });

      console.log("[gpu-compositor] WebGPU initialized");
      return true;
    } catch (e) {
      console.warn("[gpu-compositor] Failed to initialize:", e);
      return false;
    }
  }

  /**
   * Apply color grading via WebGPU.
   */
  async applyColorGrade(
    inputCanvas: OffscreenCanvas,
    outputCanvas: OffscreenCanvas,
    contrast: number,
    saturation: number,
    brightness: number,
  ): Promise<void> {
    if (!this.device || !this.pipeline || !this.bindGroupLayout) {
      // Fallback to Canvas 2D
      const ctx = outputCanvas.getContext("2d")!;
      ctx.filter = `contrast(${contrast}) saturate(${saturation}) brightness(${1 + brightness})`;
      ctx.drawImage(inputCanvas, 0, 0);
      ctx.filter = "none";
      return;
    }

    const w = inputCanvas.width;
    const h = inputCanvas.height;

    // Create textures
    const inputTexture = this.device.createTexture({
      size: [w, h],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    const outputTexture = this.device.createTexture({
      size: [w, h],
      format: "rgba8unorm",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
    });

    // Copy input canvas to texture
    const inputCtx = inputCanvas.getContext("2d")!;
    const inputData = inputCtx.getImageData(0, 0, w, h);
    this.device.queue.writeTexture(
      { texture: inputTexture },
      inputData.data,
      { bytesPerRow: w * 4 },
      [w, h],
    );

    // Create uniform buffer
    const uniformBuffer = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([contrast, saturation, brightness, 0]));

    // Create bind group
    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: inputTexture.createView() },
        { binding: 2, resource: outputTexture.createView() },
      ],
    });

    // Dispatch
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8));
    passEncoder.end();
    this.device.queue.submit([commandEncoder.finish()]);

    // Read back
    const outputData = await this.readTexture(outputTexture, w, h);
    const outputCtx = outputCanvas.getContext("2d")!;
    outputCtx.putImageData(new ImageData(outputData, w, h), 0, 0);

    // Cleanup
    inputTexture.destroy();
    outputTexture.destroy();
    uniformBuffer.destroy();
  }

  private async readTexture(texture: GPUTexture, w: number, h: number): Promise<Uint8ClampedArray> {
    const buffer = this.device!.createBuffer({
      size: w * h * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = this.device!.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
      { texture },
      { buffer, bytesPerRow: w * 4 },
      [w, h],
    );
    this.device!.queue.submit([commandEncoder.finish()]);

    await buffer.mapAsync(GPUMapMode.READ);
    const data = new Uint8ClampedArray(buffer.getMappedRange().slice(0));
    buffer.unmap();
    buffer.destroy();

    return data;
  }

  isAvailable(): boolean {
    return this.device !== null;
  }

  dispose(): void {
    this.device?.destroy();
  }
}
