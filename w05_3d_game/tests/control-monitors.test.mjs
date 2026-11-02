import test from 'node:test';
import assert from 'node:assert/strict';
import {controlRoomLayout,controlMonitorLayout} from '../src/control-room-layout.js';

test('nine televisions face the seat and remain below the ceiling across room widths',()=>{
  for(const width of [1.8,2.4,3.0])for(const ceiling of [2.4,2.7,3.2]){
    const layout=controlRoomLayout(width),panels=controlMonitorLayout(layout,ceiling);
    assert.equal(panels.length,9);assert.equal(new Set(panels.map(p=>p.channel)).size,9);
    for(const p of panels){
      const dx=layout.chairX-p.x,dy=1.25-p.y,dz=layout.chairZ-p.z,length=Math.hypot(dx,dy,dz);
      assert(Math.abs(Math.sin(p.yaw)*Math.cos(p.pitch)*dx/length-Math.sin(p.pitch)*dy/length+Math.cos(p.yaw)*Math.cos(p.pitch)*dz/length-1)<1e-10);
      assert(p.y+p.height/2+.065<ceiling);
      assert(p.width>0&&p.height>0);
    }
    assert.equal(panels.find(p=>p.channel===0).x,0,'story feed is in the middle');
  }
});
