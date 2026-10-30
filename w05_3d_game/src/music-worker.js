import {composeScore} from './music-score.js';
const score=composeScore();
postMessage(score,Object.values(score.tracks).map(track=>track.buffer));
