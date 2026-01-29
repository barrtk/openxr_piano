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

            // Handle Input Source attachment
            controller.addEventListener('connected', (event) => {
                console.log(`Controller ${i} Connected: ${event.data.handedness}`);
                controller.userData.inputSource = event.data;
                controllerGrip.visible = true;
            });

            controller.addEventListener('disconnected', () => {
                console.log(`Controller ${i} Disconnected`);
                controller.userData.inputSource = null;
                controllerGrip.visible = false;
            });
        }
    }
}
