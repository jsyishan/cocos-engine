/* eslint-disable max-len */
/*
 Copyright (c) 2020-2023 Xiamen Yaji Software Co., Ltd.

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

import { ccclass, tooltip, displayOrder, range, type, radian, serializable, visible } from 'cc.decorator';
import { Mat4, pseudoRandom, Quat, Vec3 } from '../../core';
import { Particle, ParticleModuleBase, PARTICLE_MODULE_NAME } from '../particle';
import CurveRange from './curve-range';
import { ModuleRandSeed, RenderMode } from '../enum';
import { ParticleSystem } from '../particle-system';

const ROTATION_OVERTIME_RAND_OFFSET = ModuleRandSeed.ROTATION;
const _temp_rot = new Quat();

/**
 * @en
 * This module will apply rotation to particle over life time.
 * Open the separateAxes option you can change the rotation on XYZ axis
 * Rotation on every axis is curve so you can modify these curves to see how it animate.
 * @zh
 * 本模块用于在粒子生命周期内对粒子施加旋转角速度。
 * 打开 separateAxes 就能够修改粒子在三个轴方向的旋转角速度大小。
 * 每个轴上的旋转角速度都是可以用曲线来进行编辑，修改曲线就能够看到粒子受力变化的效果了。
 */
@ccclass('cc.RotationOvertimeModule')
export default class RotationOvertimeModule extends ParticleModuleBase {
    @serializable
    _enable = false;
    /**
     * @en Enable this module or not.
     * @zh 是否启用。
     */
    @displayOrder(0)
    public get enable () {
        return this._enable;
    }

    public set enable (val) {
        if (this._enable === val) return;
        this._enable = val;
        if (!this.target) return;
        this.target.enableModule(this.name, val, this);
    }

    @serializable
    private _separateAxes = false;

    /**
     * @en Rotation around separate axis.
     * @zh 是否三个轴分开设定旋转。
     */
    @displayOrder(1)
    @tooltip('i18n:rotationOvertimeModule.separateAxes')
    get separateAxes () {
        return this._separateAxes;
    }

    set separateAxes (val) {
        this._separateAxes = val;
    }

    /**
     * @en Angle around X axis.
     * @zh 绕 X 轴设定旋转。
     */
    @type(CurveRange)
    @serializable
    @radian
    @displayOrder(2)
    @tooltip('i18n:rotationOvertimeModule.x')
    @visible(function (this: RotationOvertimeModule): boolean { return this.separateAxes; })
    public x = new CurveRange();

    /**
     * @en Angle around Y axis.
     * @zh 绕 Y 轴设定旋转。
     */
    @type(CurveRange)
    @serializable
    @radian
    @displayOrder(3)
    @tooltip('i18n:rotationOvertimeModule.y')
    @visible(function (this: RotationOvertimeModule): boolean { return this.separateAxes; })
    public y = new CurveRange();

    /**
     * @en Angle around Z axis.
     * @zh 绕 Z 轴设定旋转。
     */
    @type(CurveRange)
    @serializable
    @radian
    @displayOrder(4)
    @tooltip('i18n:rotationOvertimeModule.z')
    public z = new CurveRange();

    public name = PARTICLE_MODULE_NAME.ROTATION;
    private renderMode;

    private _startMat: Mat4 = new Mat4();
    private _matRot: Mat4 = new Mat4();
    private _quatRot: Quat = new Quat();
    private _otherEuler: Vec3 = new Vec3();

    constructor () {
        super();
        this.needUpdate = true;
    }

    public update (ps: ParticleSystem, space: number, worldTransform: Mat4) {
        this.renderMode = ps.processor.getInfo().renderMode;
        this.x.bake();
        this.y.bake();
        this.z.bake();
    }

    /**
     * @en Apply rotation to particle.
     * @zh 作用旋转到粒子上。
     * @param p @en Particle to animate @zh 模块需要更新的粒子
     * @param dt @en Update interval time @zh 粒子系统更新的间隔时间
     * @internal
     */
    public animate (p: Particle, dt: number) {
        const normalizedTime = 1 - p.remainingLifetime / p.startLifetime;
        const rotationRand = pseudoRandom(p.randomSeed + ROTATION_OVERTIME_RAND_OFFSET);

        if ((!this._separateAxes) || (this.renderMode === RenderMode.VerticalBillboard || this.renderMode === RenderMode.HorizontalBillboard)) {
            const tod = dt * Particle.R2D;
            Quat.fromEuler(p.deltaQuat, 0, 0, this.z.evaluate(normalizedTime, rotationRand)! * tod);
        } else {
            const tod = dt * Particle.R2D;
            Quat.fromEuler(p.deltaQuat, this.x.evaluate(normalizedTime, rotationRand)! * tod, this.y.evaluate(normalizedTime, rotationRand)! * tod, this.z.evaluate(normalizedTime, rotationRand)! * tod);
        }

        // Rotation-overtime combine with start rotation
        Quat.multiply(p.localQuat, p.localQuat, p.deltaQuat); // accumulate rotation
        // Quat.normalize(p.localQuat, p.localQuat);
        if (!p.startRotated) {
            if (this.renderMode !== RenderMode.Mesh) {
                if (this.renderMode === RenderMode.StrecthedBillboard) {
                    p.startEuler.set(0, 0, 0);
                } else if (this.renderMode !== RenderMode.Billboard) {
                    p.startEuler.set(0, 0, p.startEuler.z);
                }
            }
            Quat.fromEuler(p.startRotation, p.startEuler.x * Particle.R2D, p.startEuler.y * Particle.R2D, p.startEuler.z * Particle.R2D);
            Quat.normalize(p.startRotation, p.startRotation);
            p.startRotated = true;
        }

        Quat.multiply(_temp_rot, p.startRotation, p.localQuat);
        Quat.normalize(_temp_rot, _temp_rot);

        Quat.toEuler(p.rotation, _temp_rot);
        Vec3.multiplyScalar(p.rotation, p.rotation, 1.0 / Particle.R2D);
    }
}
