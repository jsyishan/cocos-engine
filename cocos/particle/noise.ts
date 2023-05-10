/*
 Copyright (c) 2022-2023 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/

import { Vec2, Vec3 } from '../core/math';
import { perlin3D, PerlinNoise3DCache } from './noise-util'

const _temp_v3 = new Vec3();
const _temp_v2 = new Vec2();
const sampleX = new Vec2();
const sampleY = new Vec2();
const sampleZ = new Vec2();

/**
 * @en Noise generation class.
 * @zh 此类生成噪声纹理。
 */
export class ParticleNoise {
    constructor () {
        this.noiseCache = new PerlinNoise3DCache();
    }

    private noise (out: Vec2, sx: number, sy: number, sz: number, freq: number) {
        _temp_v3.set(sx, sy, sz);
        return perlin3D(out, _temp_v3, freq, this.noiseCache);
    }

    private accSpeed: Vec3 = new Vec3();
    private noiseSpeed: Vec3 = new Vec3();
    private noiseFrequency = 0.0;
    private noiseAbs: Vec3 = new Vec3();
    private noiseAmplitude: Vec3 = new Vec3();
    private octaves: Vec3 = new Vec3();
    private dt = 0.0;
    private point: Vec3 = new Vec3();
    private result: Vec3 = new Vec3();
    private mixOut: Vec2 = new Vec2();
    private noiseCache: PerlinNoise3DCache;

    /**
     * @en Set texture rolling speed.
     * @zh 设置纹理滚动速度。
     * @param x @en X axis roll speed. @zh X 轴滚动速度。
     * @param y @en Y axis roll speed. @zh Y 轴滚动速度。
     * @param z @en Z axis roll speed. @zh Z 轴滚动速度。
     */
    public setSpeed (x, y, z) {
        this.noiseSpeed.set(x, y, z);
    }

    /**
     * @en Set noise frequency.
     * @zh 设置生成的噪声频率。
     * @param f @en Noise texture frequency. @zh 噪声频率。
     */
    public setFrequency (f) {
        this.noiseFrequency = f;
    }

    /**
     * @zh 将最终噪声值重新映射到不同的范围。
     * @en The curve that describes how the final noise values are transformed.
     * @param x @en X value transformed. @zh X 轴上噪声值的偏移。
     * @param y @en Y value transformed. @zh Y 轴上噪声值的偏移。
     * @param z @en Z value transformed. @zh Z 轴上噪声值的偏移。
     * @deprecated since v3.6.0
     */
    public setAbs (x, y, z) {
        this.noiseAbs.set(x, y, z);
    }

    /**
     * @en Set noise amplititude.
     * @zh 设置噪声强度。
     * @param x @en Noise amplititude on X axis. @zh X 轴上的噪声强度。
     * @param y @en Noise amplititude on Y axis. @zh Y 轴上的噪声强度。
     * @param z @en Noise amplititude on Z axis. @zh Z 轴上的噪声强度。
     */
    public setAmplititude (x, y, z) {
        this.noiseAmplitude.set(x, y, z);
    }

    /**
     * @en Specify how many layers of overlapping noise are combined to produce the final noise values.
     * @zh 指定组合多少层重叠噪声来产生最终噪声值。
     * @param x @en Layer count. @zh 噪声层数。
     * @param y @en For each additional noise layer, reduce the strength by this proportion. @zh 每一层的噪声强度衰减比例。
     * @param z @en For each additional noise layer, adjust the frequency by this multiplier. @zh 对于每个附加的噪声层，按此乘数调整频率。
     */
    public setOctaves (x, y, z) {
        this.octaves.set(x, y, z);
    }

    /**
     * @en Set update interval time.
     * @zh 设置更新间隔时间。
     * @param t @en Update interval time. @zh 更新的间隔时间。
     */
    public setTime (t) {
        this.dt = t;
    }

    /**
     * @en Set noise texture sample point.
     * @zh 设置噪声纹理的采样点。
     * @param p @en Sample point of noise texture. @zh 噪声纹理采样点。
     */
    public setSamplePoint (p: Vec3) {
        this.point.set(p);
    }

    /**
     * @en Get the sample pixel.
     * @zh 获取采样的像素。
     * @returns @en The sample result. @zh 纹理采样结果。
     */
    public getResult (): Vec3 {
        return this.result;
    }

    private accumulateNoise3D (outSample: Vec2, x: number, y: number, z: number, frequency: number, octaveToIndex: number, octaveScale: number, octaveMultiplier: number) {
        const sum = this.noise(outSample, x, y, z, frequency);
        let amplitude = 1;
        let range = 1;
        for (let i = 1; i < octaveToIndex; i++) {
            frequency *= octaveScale;
            amplitude *= octaveMultiplier;
            range += amplitude;
            Vec2.scaleAndAdd(sum, sum, this.noise(_temp_v2, x, y, z, frequency), amplitude);
        }
        return Vec2.multiplyScalar(sum, sum, 1 / range);
    }

    private getNoise (out: Vec2, sx: number, sy: number, sz: number, noiseFrequency: number, octaves: Vec3) {
        this.accumulateNoise3D(out, sx, sy, sz, noiseFrequency, octaves.x, octaves.z, octaves.y);
    }

    /**
     * @en Sample pixel from noise texture.
     * @zh 从噪声纹理采样像素。
     */
    public getNoiseParticle () {
        this.accSpeed.set(this.noiseSpeed.x * this.dt, this.noiseSpeed.y * this.dt, this.noiseSpeed.z * this.dt);

        const axisOffset = 1000.0;
        // eslint-disable-next-line max-len
        this.getNoise(sampleX, this.point.z + this.accSpeed.x, this.point.y, this.point.x, this.noiseFrequency, this.octaves);
        // eslint-disable-next-line max-len
        this.getNoise(sampleY, this.point.x + axisOffset, this.point.z + this.accSpeed.y, this.point.y, this.noiseFrequency, this.octaves);
        // eslint-disable-next-line max-len
        this.getNoise(sampleZ, this.point.y, this.point.x + axisOffset, this.point.z + this.accSpeed.z, this.noiseFrequency, this.octaves);

        const sampX = sampleZ.x - sampleY.y;
        const sampY = sampleX.x - sampleZ.y;
        const sampZ = sampleY.x - sampleX.y;

        this.result.set(sampX * this.noiseAmplitude.x, sampY * this.noiseAmplitude.y, sampZ * this.noiseAmplitude.z);
    }

    /**
     * @en Generate noise texture preview.
     * @zh 生成噪声纹理的预览。
     * @param out @en Noise pixel array. @zh 噪声像素 RGB 数组。
     * @param width @en Texture width. @zh 纹理宽度。
     * @param height @en Texture height. @zh 纹理高度。
     */
    public getPreview (out: number[], width: number, height: number) {
        for (let h = 0; h < height; ++h) {
            for (let w = 0; w < width; ++w) {
                const sampx = (w - width * 0.5) / width + this.noiseSpeed.x * this.dt;
                const sampy = (h - height * 0.5) / height + this.noiseSpeed.y * this.dt;
                this.getNoise(sampleY, sampx, sampy, 0.0, this.noiseFrequency, this.octaves);
                this.getNoise(sampleZ, sampx, sampy, 0.0, this.noiseFrequency, this.octaves);
                const pix = sampleZ.x - sampleY.y;
                out[h * width + w] = (pix + 1.0) * 0.5;
            }
        }
    }
}
