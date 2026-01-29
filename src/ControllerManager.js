import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export class ControllerManager {
    constructor(renderer, scene) {
        this.renderer = renderer;
        this.scene = scene;

        this.controllerModelFactory = new XRControllerModelFactory();
        this.controllers = [];

        this.init();
    }

    init() {
        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);
            this.scene.add(controller);

            const controllerGrip = this.renderer.xr.getControllerGrip(i);
            const model = this.controllerModelFactory.createControllerModel(controllerGrip);
            controllerGrip.add(model);
            this.scene.add(controllerGrip);

            this.controllers.push({ controller, controllerGrip });

            // Basic "Glow" for controllers - add a small point light to each
            const light = new THREE.PointLight(0x00f2ff, 1, 0.5);
            controller.add(light);
        }
    }
}
