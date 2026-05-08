import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  CAMERA_TRANSITION_DURATION_S,
  CameraController,
  getCameraPose,
  normalizeCameraMode,
} from './camera-controller';

function makeCamera(): THREE.PerspectiveCamera {
  // Match the camera AvatarScene constructs (FOV 30°, aspect 1, near 0.1, far 20).
  return new THREE.PerspectiveCamera(30, 1, 0.1, 20);
}

describe('getCameraPose', () => {
  it('resolves headshot to plan §4 literals exactly', () => {
    const pose = getCameraPose('headshot');
    expect(pose.position.x).toBe(0);
    expect(pose.position.y).toBe(1.55);
    expect(pose.position.z).toBe(0.65);
    expect(pose.target.x).toBe(0);
    expect(pose.target.y).toBe(1.5);
    expect(pose.target.z).toBe(0);
    expect(pose.fov).toBe(22);
  });

  it('resolves upper_torso to the same numbers as the legacy portrait pose', () => {
    const pose = getCameraPose('upper_torso');
    expect(pose.position.toArray()).toEqual([0, 1.4, 1.5]);
    expect(pose.target.toArray()).toEqual([0, 1.3, 0]);
    expect(pose.fov).toBe(30);
  });

  it('resolves fullbody to the existing pose unchanged', () => {
    const pose = getCameraPose('fullbody');
    expect(pose.position.toArray()).toEqual([0, 2.0, 4.5]);
    expect(pose.target.toArray()).toEqual([0, 0.9, 0]);
    expect(pose.fov).toBe(30);
  });
});

describe('normalizeCameraMode', () => {
  it('maps the legacy "portrait" input to "upper_torso"', () => {
    expect(normalizeCameraMode('portrait')).toBe('upper_torso');
  });

  it('passes through canonical modes unchanged', () => {
    expect(normalizeCameraMode('headshot')).toBe('headshot');
    expect(normalizeCameraMode('upper_torso')).toBe('upper_torso');
    expect(normalizeCameraMode('fullbody')).toBe('fullbody');
  });
});

describe('CameraController', () => {
  it('defaults to upper_torso framing with the legacy portrait numbers and FOV 30°', () => {
    const camera = makeCamera();
    const controller = new CameraController(camera);
    expect(controller.getMode()).toBe('upper_torso');
    expect(camera.position.toArray()).toEqual([0, 1.4, 1.5]);
    expect(controller.getCurrentTarget().toArray()).toEqual([0, 1.3, 0]);
    expect(camera.fov).toBe(30);
  });

  it('switches to headshot pose after the transition completes', () => {
    const camera = makeCamera();
    const controller = new CameraController(camera);
    controller.setMode('headshot');
    // Run forward past the full transition duration.
    controller.update(CAMERA_TRANSITION_DURATION_S + 0.01);
    expect(controller.getMode()).toBe('headshot');
    expect(camera.position.x).toBeCloseTo(0, 6);
    expect(camera.position.y).toBeCloseTo(1.55, 6);
    expect(camera.position.z).toBeCloseTo(0.65, 6);
    expect(controller.getCurrentTarget().y).toBeCloseTo(1.5, 6);
    expect(camera.fov).toBeCloseTo(22, 6);
  });

  it('treats legacy "portrait" input as upper_torso', () => {
    const camera = makeCamera();
    const controller = new CameraController(camera);
    controller.setMode('fullbody');
    controller.update(CAMERA_TRANSITION_DURATION_S + 0.01);
    expect(controller.getMode()).toBe('fullbody');

    controller.setMode('portrait');
    expect(controller.getMode()).toBe('upper_torso');
    controller.update(CAMERA_TRANSITION_DURATION_S + 0.01);
    expect(camera.position.toArray()).toEqual([0, 1.4, 1.5]);
    expect(controller.getCurrentTarget().toArray()).toEqual([0, 1.3, 0]);
    expect(camera.fov).toBeCloseTo(30, 6);
  });

  it('uses the unchanged 750ms transition duration', () => {
    expect(CAMERA_TRANSITION_DURATION_S).toBe(0.75);
  });

  it('uses ease-in-out cubic easing — exact midpoint at half duration', () => {
    // ease-in-out cubic crosses 0.5 at progress=0.5, so at half the transition
    // duration the camera should sit exactly at the midpoint between poses.
    const camera = makeCamera();
    const controller = new CameraController(camera);
    controller.setMode('fullbody');
    controller.update(CAMERA_TRANSITION_DURATION_S / 2);
    expect(camera.position.x).toBeCloseTo((0 + 0) / 2, 6);
    expect(camera.position.y).toBeCloseTo((1.4 + 2.0) / 2, 6);
    expect(camera.position.z).toBeCloseTo((1.5 + 4.5) / 2, 6);
    expect(controller.getCurrentTarget().y).toBeCloseTo((1.3 + 0.9) / 2, 6);
  });

  it('does not restart a transition when the requested mode equals the current canonical mode', () => {
    const camera = makeCamera();
    const controller = new CameraController(camera);
    // Initial mode is upper_torso; sending legacy 'portrait' should be a no-op.
    controller.setMode('portrait');
    expect(controller.getMode()).toBe('upper_torso');
    // Camera shouldn't have moved off the initial pose.
    expect(camera.position.toArray()).toEqual([0, 1.4, 1.5]);
  });
});
