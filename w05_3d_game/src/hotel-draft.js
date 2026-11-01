import {createDefaultHotelDocument,normalizeHotelDocument,validateHotelDocument} from './hotel-document.js';

export const HOTEL_DRAFT_STORAGE_KEY='night-hotel.hotel-draft.v1';
export const HOTEL_PREVIEW_STORAGE_KEY='night-hotel.hotel-previews.v1';
export const HOTEL_PREVIEW_TTL_MS=7*24*60*60*1000;
const browser=()=>typeof window!=='undefined';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function storageFor(options){
  if(options.storage)return options.storage;
  if(!browser())throw new Error('当前环境没有浏览器本地存储。');
  try{return window.localStorage;}catch{throw new Error('浏览器禁止本地存储，无法保存酒店草稿。');}
}
function snapshots(storage){
  const raw=storage.getItem(HOTEL_PREVIEW_STORAGE_KEY);if(raw===null)return[];
  const list=JSON.parse(raw);if(!Array.isArray(list)||list.length>5)throw new Error('酒店试玩快照列表已损坏。');
  for(const item of list)if(!item||typeof item.id!=='string'||!Number.isFinite(item.createdAt)||!item.document)throw new Error('酒店试玩快照信息已损坏。');
  return list;
}
export function saveHotelDraft(raw,options={}){
  const document=normalizeHotelDocument(raw);
  try{storageFor(options).setItem(HOTEL_DRAFT_STORAGE_KEY,JSON.stringify(document));}catch(error){throw new Error(`酒店草稿未能保存：${error.message}`);}
  return document;
}
export function loadHotelDraft(options={}){
  try{const raw=storageFor(options).getItem(HOTEL_DRAFT_STORAGE_KEY);return{document:raw===null?null:normalizeHotelDocument(JSON.parse(raw)),error:null};}
  catch(error){return{document:null,error:`酒店草稿读取失败：${error.message}`};}
}
export function createHotelPreview(raw,options={}){
  const document=normalizeHotelDocument(raw),validation=validateHotelDocument(document);
  if(!validation.valid)throw new Error(validation.errors.map(e=>e.message).join(' '));
  const storage=storageFor(options),now=options.now??Date.now(),id=globalThis.crypto?.randomUUID?.()??`${now.toString(36)}-${Math.random().toString(36).slice(2)}`;
  let previous=[];try{previous=snapshots(storage);}catch{/* A valid preview may replace a corrupt preview index without changing the saved draft. */}
  const next=[...previous.filter(item=>item.createdAt<=now+300000&&now-item.createdAt<=HOTEL_PREVIEW_TTL_MS),{id,createdAt:now,document}].slice(-5);
  try{storage.setItem(HOTEL_PREVIEW_STORAGE_KEY,JSON.stringify(next));}catch(error){throw new Error(`无法创建酒店试玩快照：${error.message}`);}
  const url=new URL('./index.html',options.baseURL??(browser()?window.location.href:'http://localhost/'));
  url.search='';url.hash='';url.searchParams.set('hotelDraft',id);return{id,url:url.href};
}
export function loadRuntimeHotelDefinition(options={}){
  const params=new URLSearchParams(options.search??(browser()?window.location.search:''));
  if(!params.has('hotelDraft'))return{definition:createDefaultHotelDocument(),isDraft:false,error:null,draftId:null};
  const draftId=params.get('hotelDraft');
  try{
    if(params.has('mapDraft')||params.getAll('hotelDraft').length!==1||!draftId||!/^[a-zA-Z0-9_-]{8,80}$/.test(draftId))throw new Error('酒店试玩链接无效。');
    const item=snapshots(storageFor(options)).find(item=>item.id===draftId);
    if(!item)throw new Error('此酒店试玩快照不存在，请返回酒店编辑器重新试玩。');
    const now=options.now??Date.now();if(now-item.createdAt>HOTEL_PREVIEW_TTL_MS||item.createdAt>now+300000)throw new Error('此酒店试玩快照已过期，请重新创建。');
    const definition=normalizeHotelDocument(item.document),validation=validateHotelDocument(definition);
    if(!validation.valid)throw new Error(validation.errors.map(e=>e.message).join(' '));
    return{definition,isDraft:true,error:null,draftId};
  }catch(error){return{definition:null,isDraft:true,error:`酒店试玩加载失败：${error.message}`,draftId};}
}

// One immutable selection is shared by terrain, gameplay facilities and cameras.
// Normal play never reads draft storage; only an explicit hotelDraft URL does.
export const RUNTIME_HOTEL=freeze(loadRuntimeHotelDefinition());
