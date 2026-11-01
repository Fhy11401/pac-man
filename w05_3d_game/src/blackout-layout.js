import {RUNTIME_HOTEL} from './hotel-draft.js';
import {HOTEL_DEFAULT_DOCUMENT} from './hotel-default-data.js';

// Terrain and gameplay consume the same immutable hotel snapshot.
const document=RUNTIME_HOTEL.definition??HOTEL_DEFAULT_DOCUMENT;
export const BLACKOUT_LAYOUT=Object.freeze({...document.facilities,lockers:Object.freeze([])});
export const SECURITY_CAMERA_LAYOUT=BLACKOUT_LAYOUT.cameras;

export const BLACKOUT_RULES=Object.freeze({
  corridorWidth:2.0,repairSeconds:8,batterySeconds:90,batteryPickup:40,
  phoneSeconds:7,phoneCooldown:14,hearingWalk:0,hearingRun:7,
  sightRange:8,flashlightRange:7,searchSeconds:5,monitorConnectSeconds:1.25,
  roomDoorHoldSeconds:1.2,roomDoorTapThreshold:.25,roomDoorQuickDelay:.18,roomDoorSeconds:.28,
  roomDoorBashSeconds:5,roomDoorBashInterval:.5,roomSearchPasses:2,roomSearchLookSeconds:.9,
});
