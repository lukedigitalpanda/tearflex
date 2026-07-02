# Spike: camera intrinsics from react-native-vision-camera (Slice 2 feasibility)

**Date:** 2026-07-02. **Question:** can mobile populate `camera_focal_px` + `capture_width_px`/`capture_height_px` (the fields the backend has consumed since migrations 0002/0003) from react-native-vision-camera, or is a native module needed?

## Verdict

**vision-camera 4.7.3 (installed; matches package.json `^4.7.3`) exposes NO camera intrinsics.** Zero hits for intrinsic/calibration/focal-length fields across its TS API and native source. Three upstream feature requests were closed unimplemented (mrousavy/react-native-vision-camera #3032, #2998, #3093); the maintainer scrapped a calibration-matrix attempt ("a lot of code"). v4 is now archived; V5 reportedly adds *some* intrinsics API (#3032 "fixed in V5!"), likely per-frame only — unverified, and a major upgrade.

What v4 does expose:
- `CameraDeviceFormat.fieldOfView` (degrees). iOS = Apple's native per-format **horizontal** `videoFieldOfView` at zoom 1.0 (good). Android = the lib computes a **diagonal** FoV of the **full physical sensor** from `LENS_INFO_AVAILABLE_FOCAL_LENGTHS` + `SENSOR_INFO_PHYSICAL_SIZE`, ignoring crop/zoom, and has shifted 12–18° between releases for identical hardware (#3505).
- `PhotoFile.width/height` (cross-platform) and EXIF metadata (**iOS only**) incl. `FocalLength` (mm) and `FocalLenIn35mmFilm`.

## Options ranked (f_px accuracy target: ~1% ≈ ~1 D of K)

| | iOS | Android | Accuracy | Effort |
|---|---|---|---|---|
| **D — local native module (true intrinsics)** | reliable: `isCameraIntrinsicMatrixDeliveryEnabled` on a plain video output — works on any single camera, **no depth requirement** | `LENS_INTRINSIC_CALIBRATION` + `SENSOR_INFO_PRE_CORRECTION_ACTIVE_ARRAY_SIZE` — **frequently null even on Pixels** | ~1% when present | 1–2 days; Expo Modules API local module keyed off vision-camera `device.id` |
| **B — FoV-derived** `f_px = (w/2)/tan(FoV_h/2)` | good | fair (must convert lib's diagonal→horizontal; release-unstable) | few–10% | low |
| C — EXIF `f_px ≈ w·f35/36` | good | poor/absent (`FocalLenIn35mmFilm` 0 on some devices, #1429) | ≈ B | skip |
| A — direct field | no such field | no such field | — | not an option |

**Recommendation (spike, not yet user-ratified): D primary + B automatic fallback** (fallback will be common on Android). No community npm package exists for this.

## Repo facts that shape the build

- Capture screen `mobile/app/assessment/topography-capture.tsx`: uses `useCameraDevice('back')`, bare `takePhoto()` ×5 + 1.8 s video; **no `useCameraFormat`/`format` prop** (implicit default format); **discards `photo.width/height`** (keeps only `.path`).
- Upload payload builder = the `fields` object in `mobile/hooks/useTopographyUpload.ts:21-25` (currently `assessment`/`device_model`/`phone_model_id`) → `api.postTopographyScan` multipart (`mobile/lib/api.ts:120-152`). New fields slot in there as string form values; backend serializer already accepts + validates them.
- Expo SDK 52, `expo-dev-client` present (native modules viable), **CNG**: `ios/`/`android/` are gitignored prebuild output — any native code must ship as an Expo config plugin / local Expo module, never hand-edits to `ios//android/`. No custom native module exists yet (new infrastructure).
- Semantics contract (backend `intrinsics.effective_focal_px`): `capture_width_px/height_px` = the dims `camera_focal_px` is expressed at; aspect mismatch with the analysed still ⇒ refuse calibration (uncalibrated). Option D sends the intrinsic's reference dims; option B derives f_px at the photo's own dims (aspect always matches).
- Safety net: the plausibility backstop (merged 2026-07-02) downgrades grossly-wrong intrinsics to `uncalibrated` instead of publishing them.
- Correction to an earlier assumption: `2026-06-24-calibration-foundation-design.md` claimed vision-camera "adds reliable camera intrinsics" on iOS — **false for v4**; revise when scoping Slice 2.

Verification limits in this environment: mobile has no test runner and no device — build gate is `tsc --noEmit` + manual reasoning; real f_px values need a physical phone.
