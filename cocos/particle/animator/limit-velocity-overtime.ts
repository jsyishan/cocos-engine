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

import { ccclass, tooltip, displayOrder, range, type, serializable, visible } from 'cc.decorator';
import { lerp, pseudoRandom, Vec3, Mat4, Quat } from '../../core';
import { Space, ModuleRandSeed } from '../enum';
import { Particle, ParticleModuleBase, PARTICLE_MODULE_NAME } from '../particle';
import CurveRange from './curve-range';
import { calculateTransform, isCurveTwoValues } from '../particle-general-function';
import { CCBoolean, CCFloat } from '../../core';
import { ParticleSystem } from '../particle-system';

const LIMIT_VELOCITY_RAND_OFFSET = ModuleRandSeed.LIMIT;
const LIMIT_DRAG_RAND_OFFSET = LIMIT_VELOCITY_RAND_OFFSET + 1;

const animatedVelocity = new Vec3();
const magVel = new Vec3();
const normalizedVel = new Vec3();

/**
 * @en
 * This module will damping particle velocity to the limit value over life time.
 * Open the separateAxes option you can damping the particle velocity on XYZ axis
 * Limit value on every axis is curve so you can modify these curves to see how it animate.
 * @zh
 * 本模块用于在粒子生命周期内对速度进行衰减，速度每次衰减比例为 dampen 持续衰减到极限速度。
 * 打开 separateAxes 就能够修改粒子在三个轴方向的极限速度大小。
 * 每个轴上的粒子极限速度大小都是可以用曲线来进行编辑，修改曲线就能够看到粒子大小变化的效果了。
 */
@ccclass('cc.LimitVelocityOvertimeModule')
export default class LimitVelocityOvertimeModule extends ParticleModuleBase {
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

    /**
     * @en Limit velocity on X axis.
     * @zh X 轴方向上的速度下限。
     */
    @type(CurveRange)
    @serializable
    @displayOrder(4)
    @tooltip('i18n:limitVelocityOvertimeModule.limitX')
    @visible(function (this: LimitVelocityOvertimeModule): boolean {
        return this.separateAxes;
    })
    public limitX = new CurveRange();

    /**
     * @en Limit velocity on Y axis.
     * @zh Y 轴方向上的速度下限。
     */
    @type(CurveRange)
    @serializable
    @displayOrder(5)
    @tooltip('i18n:limitVelocityOvertimeModule.limitY')
    @visible(function (this: LimitVelocityOvertimeModule): boolean {
        return this.separateAxes;
    })
    public limitY = new CurveRange();

    /**
     * @en Limit velocity on Z axis.
     * @zh Z 轴方向上的速度下限。
     */
    @type(CurveRange)
    @serializable
    @displayOrder(6)
    @tooltip('i18n:limitVelocityOvertimeModule.limitZ')
    @visible(function (this: LimitVelocityOvertimeModule): boolean {
        return this.separateAxes;
    })
    public limitZ = new CurveRange();

    /**
     * @en Velocity limit.
     * @zh 速度下限。
     */
    @type(CurveRange)
    @serializable
    @displayOrder(3)
    @tooltip('i18n:limitVelocityOvertimeModule.limit')
    @visible(function (this: LimitVelocityOvertimeModule): boolean {
        return !this.separateAxes;
    })
    public limit = new CurveRange();

    /**
     * @en Dampen velocity percent every time.
     * @zh 速度每次衰减的比例。
     */
    @serializable
    @displayOrder(7)
    @tooltip('i18n:limitVelocityOvertimeModule.dampen')
    public dampen = 3;

    /**
     * @en Limit velocity on separate axis.
     * @zh 是否三个轴分开限制。
     */
    @serializable
    @displayOrder(2)
    @tooltip('i18n:limitVelocityOvertimeModule.separateAxes')
    public separateAxes = false;

    /**
     * @en Space used to calculate limit velocity.
     * @zh 计算速度下限时采用的坐标系 [[Space]]。
     */
    @type(Space)
    @serializable
    @displayOrder(1)
    @tooltip('i18n:limitVelocityOvertimeModule.space')
    public space = Space.Local;

    @type(CurveRange)
    @serializable
    @displayOrder(8)
    public drag = new CurveRange();

    @type(CCFloat)
    @serializable
    @displayOrder(9)
    public sizeFactor = 1.0;

    @type(CCBoolean)
    @serializable
    @displayOrder(10)
    public multiplyDragByParticleSize = false;

    @type(CCBoolean)
    @serializable
    @displayOrder(11)
    public multiplyDragByParticleVelocity = false;

    public name = PARTICLE_MODULE_NAME.LIMIT;
    private rotation: Quat;
    private invRot: Quat;
    private needTransform: boolean;

    constructor () {
        super();
        this.rotation = new Quat();
        this.invRot = new Quat();
        this.needTransform = false;
        this.needUpdate = true;
    }

    /**
     * @en Update limit velocity module calculate transform.
     * @zh 更新模块，计算坐标变换。
     * @param space @en Limit velocity module update space @zh 模块更新空间
     * @param worldTransform @en Particle system world transform @zh 粒子系统的世界变换矩阵
     * @internal
     */
    public update (ps:ParticleSystem, space: number, worldTransform: Mat4) {
        // this.needTransform = calculateTransform(space, this.space, worldTransform, this.rotation);
        this.drag.bake();
        this.limitX.bake();
        this.limitY.bake();
        this.limitZ.bake();
        this.limit.bake();
    }

    private applyDrag (p: Particle, dt: number, velNormalized: Vec3, velMag: number) {
        if (this.drag.getMaxAbs() === 0.0) {
            return;
        }
        const normalizedTime = 1 - p.remainingLifetime / p.startLifetime;
        const dragCoefficient = this.drag.evaluate(normalizedTime, pseudoRandom(p.randomSeed + LIMIT_DRAG_RAND_OFFSET));
        let maxDimension = p.size.x > p.size.y ? p.size.x : p.size.y;
        maxDimension = maxDimension > p.size.z ? maxDimension : p.size.z;
        maxDimension *= 0.5;
        maxDimension *= this.sizeFactor;
        const circleArea = (Math.PI * maxDimension * maxDimension);

        let dragN = dragCoefficient;
        dragN *= this.multiplyDragByParticleSize ? circleArea : 1.0;
        dragN *= this.multiplyDragByParticleVelocity ? velMag * velMag : 1.0;

        let mag = velMag - dragN * dt;
        mag = mag < 0 ? 0 : mag;

        Vec3.multiplyScalar(magVel, velNormalized, mag);
    }

    /**
     * @en Apply limit velocity to particle.
     * @zh 作用速度衰减到粒子上。
     * @param p @en Particle to animate @zh 模块需要更新的粒子
     * @param dt @en Update interval time @zh 粒子系统更新的间隔时间
     * @internal
     */
    public animate (p: Particle, dt: number) {
        const normalizedTime = 1 - p.remainingLifetime / p.startLifetime;

        animatedVelocity.set(p.animatedVelocity);
        Vec3.add(magVel, p.velocity, animatedVelocity);

        if (this.separateAxes) {
            const rndSeed = pseudoRandom(p.randomSeed + LIMIT_VELOCITY_RAND_OFFSET);
            const limitX = this.limitX.evaluate(normalizedTime, rndSeed);
            const limitY = this.limitY.evaluate(normalizedTime, rndSeed);
            const limitZ = this.limitZ.evaluate(normalizedTime, rndSeed);

            if (this.needTransform) {
                Vec3.transformQuat(magVel, magVel, this.rotation);
            }
            Vec3.set(magVel,
                dampenBeyondLimit(magVel.x, limitX, this.dampen),
                dampenBeyondLimit(magVel.y, limitY, this.dampen),
                dampenBeyondLimit(magVel.z, limitZ, this.dampen));

            Vec3.normalize(normalizedVel, magVel);
            const velLen = magVel.length();
            this.applyDrag(p, dt, normalizedVel, velLen);

            Vec3.subtract(magVel, magVel, animatedVelocity);

            if (this.needTransform) {
                Quat.invert(this.invRot, this.rotation);
                Vec3.transformQuat(magVel, magVel, this.invRot);
            }
        } else {
            const lmt = this.limit.evaluate(normalizedTime, pseudoRandom(p.randomSeed + LIMIT_VELOCITY_RAND_OFFSET));
            let velLen = magVel.length();
            Vec3.normalize(normalizedVel, magVel);

            const damped = dampenBeyondLimit(velLen, lmt, this.dampen);
            Vec3.multiplyScalar(magVel, normalizedVel, damped);

            Vec3.normalize(normalizedVel, magVel);
            velLen = magVel.length();
            this.applyDrag(p, dt, normalizedVel, velLen);

            Vec3.subtract(magVel, magVel, animatedVelocity);
        }
        p.velocity.set(magVel);
    }
}

function dampenBeyondLimit (vel: number, limit: number, dampen: number) {
    const sgn = Math.sign(vel);
    let abs = Math.abs(vel);
    if (abs > limit) {
        const absToGive = abs - abs * dampen;
        if (absToGive > limit) {
            abs = absToGive;
        } else {
            abs = limit;
        }
    }
    return abs * sgn;
}
