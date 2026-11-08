// Shared by the scene and audio event clock, including pause/restart.
export const OPENING_STRIKE_AT=12.72;
export const OPENING_STRIKE_DURATION=.19;
export const OPENING_CUT_AT=14.0;

// Quintic easing gives the push-in zero velocity and acceleration at both ends.
export function openingPushProgress(time){const t=Math.max(0,Math.min(1,(time-3.5)/3.2));return t>=1-1e-12?1:t*t*t*(t*(t*6-15)+10);}

// Keep movement phases separate: enter, push-in, watch, crawl, empty hold, strike.
export const OPENING_CRAWL_AT=7.55;
export const OPENING_CRAWL_MOVE_AT=8.15;
export const OPENING_CRAWL_END=10.55;
