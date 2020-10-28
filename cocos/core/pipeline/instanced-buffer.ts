/**
 * @packageDocumentation
 * @hidden
 */

import { Pass } from '../renderer';
import { IInstancedAttributeBlock, SubModel } from '../renderer/scene';
import { SubModelView, SubModelPool, ShaderHandle, DescriptorSetHandle, PassHandle, NULL_HANDLE } from '../renderer/core/memory-pools';
import { UNIFORM_LIGHTMAP_TEXTURE_BINDING } from './define';
import { GFXBufferUsageBit, GFXMemoryUsageBit, GFXDevice, GFXTexture, GFXInputAssembler, GFXInputAssemblerInfo,
    GFXAttribute, GFXBuffer, GFXBufferInfo, GFXCommandBuffer  } from '../gfx';

export interface IInstancedItem {
    count: number;
    capacity: number;
    vb: GFXBuffer;
    data: Uint8Array;
    ia: GFXInputAssembler;
    stride: number;
    hShader: ShaderHandle;
    hDescriptorSet: DescriptorSetHandle;
    lightingMap: GFXTexture;
}

const INITIAL_CAPACITY = 32;
const MAX_CAPACITY = 1024;

export class InstancedBuffer {

    private static _buffers = new Map<Pass, Record<number, InstancedBuffer>>();

    public static get (pass: Pass, extraKey = 0) {
        const buffers = InstancedBuffer._buffers;
        if (!buffers.has(pass)) buffers.set(pass, {});
        const record = buffers.get(pass)!;
        return record[extraKey] || (record[extraKey] = new InstancedBuffer(pass));
    }

    public instances: IInstancedItem[] = [];
    public hPass: PassHandle = NULL_HANDLE;
    public hasPendingModels = false;
    public dynamicOffsets: number[] = [];
    private _device: GFXDevice;

    constructor (pass: Pass) {
        this._device = pass.device;
        this.hPass = pass.handle;
    }

    public destroy () {
        for (let i = 0; i < this.instances.length; ++i) {
            const instance = this.instances[i];
            instance.vb.destroy();
            instance.ia.destroy();
        }
        this.instances.length = 0;
    }

    public merge (subModel: SubModel, attrs: IInstancedAttributeBlock, passIdx: number, hShaderImplant: ShaderHandle | null = null) {
        const stride = attrs.buffer.length;
        if (!stride) { return; } // we assume per-instance attributes are always present
        const sourceIA = subModel.inputAssembler;
        const lightingMap = subModel.descriptorSet.getTexture(UNIFORM_LIGHTMAP_TEXTURE_BINDING);
        const hShader = SubModelPool.get(subModel.handle, SubModelView.SHADER_0 + passIdx) as ShaderHandle;
        const hDescriptorSet = SubModelPool.get(subModel.handle, SubModelView.DESCRIPTOR_SET);
        for (let i = 0; i < this.instances.length; ++i) {
            const instance = this.instances[i];
            if (instance.ia.indexBuffer !== sourceIA.indexBuffer || instance.count >= MAX_CAPACITY) { continue; }

            // check same binding
            if (instance.lightingMap !== lightingMap) {
                continue;
            }

            if (instance.stride !== stride) {
                // console.error(`instanced buffer stride mismatch! ${stride}/${instance.stride}`);
                return;
            }
            if (instance.count >= instance.capacity) { // resize buffers
                instance.capacity <<= 1;
                const newSize = instance.stride * instance.capacity;
                const oldData = instance.data;
                instance.data = new Uint8Array(newSize);
                instance.data.set(oldData);
                instance.vb.resize(newSize);
            }
            if (instance.hShader !== hShader) { instance.hShader = hShader; }
            if (instance.hDescriptorSet !== hDescriptorSet) { instance.hDescriptorSet = hDescriptorSet; }
            instance.data.set(attrs.buffer, instance.stride * instance.count++);
            this.hasPendingModels = true;
            return;
        }

        // Create a new instance
        const vb = this._device.createBuffer(new GFXBufferInfo(
            GFXBufferUsageBit.VERTEX | GFXBufferUsageBit.TRANSFER_DST,
            GFXMemoryUsageBit.HOST | GFXMemoryUsageBit.DEVICE,
            stride * INITIAL_CAPACITY,
            stride,
        ));
        const data = new Uint8Array(stride * INITIAL_CAPACITY);
        const vertexBuffers = sourceIA.vertexBuffers.slice();
        const attributes = sourceIA.attributes.slice();
        const indexBuffer = sourceIA.indexBuffer;

        for (let i = 0; i < attrs.attributes.length; i++) {
            const attr = attrs.attributes[i];
            const newAttr = new GFXAttribute(attr.name, attr.format, attr.isNormalized, vertexBuffers.length, true);
            attributes.push(newAttr);
        }
        data.set(attrs.buffer);

        vertexBuffers.push(vb);
        const iaInfo = new GFXInputAssemblerInfo(attributes, vertexBuffers, indexBuffer);
        const ia = this._device.createInputAssembler(iaInfo);
        this.instances.push({ count: 1, capacity: INITIAL_CAPACITY, vb, data, ia, stride, hShader, hDescriptorSet, lightingMap});
        this.hasPendingModels = true;
    }

    public uploadBuffers (cmdBuff: GFXCommandBuffer) {
        for (let i = 0; i < this.instances.length; ++i) {
            const instance = this.instances[i];
            if (!instance.count) { continue; }
            instance.ia.instanceCount = instance.count;
            cmdBuff.updateBuffer(instance.vb, instance.data);
        }
    }

    public clear () {
        for (let i = 0; i < this.instances.length; ++i) {
            const instance = this.instances[i];
            instance.count = 0;
        }
        this.hasPendingModels = false;
    }
}
