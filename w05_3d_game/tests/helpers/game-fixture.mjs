import {createGame} from '../../src/core.js';

// Movement and pursuit fixtures start after the prologue. The entry tests use
// createGame directly to exercise the default closed gate and protected room.
export function mazeGame(tuning){
 const game=createGame(tuning);game.entryOpened=true;game.entryBreakTime=.8;return game;
}
