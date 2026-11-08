import {createDefaultMapDocument,normalizeMapDocument,validateMapDocument} from './map-document.js';

export const DRAFT_STORAGE_KEY='night-hotel.map-draft.v1';
export const PREVIEW_STORAGE_KEY='night-hotel.map-previews.v1';
export const PREVIEW_TTL_MS=7*24*60*60*1000;
const browser=()=>typeof window!=='undefined';
function storageFor(options){
  if(options.storage)return options.storage;
  if(!browser())throw new Error('当前环境没有浏览器本地存储。');
  try{return window.localStorage;}catch{throw new Error('浏览器禁止了本地存储，无法保存地图。');}
}
function snapshotList(storage){
  const text=storage.getItem(PREVIEW_STORAGE_KEY);if(text===null)return[];
  const list=JSON.parse(text);if(!Array.isArray(list)||list.length>5)throw new Error('试玩快照列表已损坏。');
  for(const item of list)if(!item||typeof item.id!=='string'||!Number.isFinite(item.createdAt)||!item.document)throw new Error('试玩快照信息已损坏。');
  return list;
}
export function saveDraft(raw,options={}){
  const document=normalizeMapDocument(raw);
  try{storageFor(options).setItem(DRAFT_STORAGE_KEY,JSON.stringify(document));}catch(error){throw new Error(`草稿未能保存：${error.message}`);}
  return document;
}
export function loadDraft(options={}){
  try{const text=storageFor(options).getItem(DRAFT_STORAGE_KEY);return {document:text===null?null:normalizeMapDocument(JSON.parse(text)),error:null};}
  catch(error){return {document:null,error:`草稿读取失败：${error.message}`};}
}
export function createPreview(raw,options={}){
  const document=normalizeMapDocument(raw),validation=validateMapDocument(document);
  if(!validation.valid)throw new Error(validation.errors.map(error=>error.message).join(' '));
  const storage=storageFor(options),now=options.now??Date.now();
  const id=globalThis.crypto?.randomUUID?.()??`${now.toString(36)}-${Math.random().toString(36).slice(2)}`;
  let previous=[];try{previous=snapshotList(storage);}catch{/* A new valid snapshot replaces only a damaged preview index, not the saved draft. */}
  const snapshots=[...previous.filter(item=>now-item.createdAt<=PREVIEW_TTL_MS),{id,createdAt:now,document}].slice(-5);
  try{storage.setItem(PREVIEW_STORAGE_KEY,JSON.stringify(snapshots));}catch(error){throw new Error(`无法创建试玩快照：${error.message}`);}
  const url=new URL('./index.html',options.baseURL??(browser()?window.location.href:'http://localhost/'));
  url.searchParams.set('mapDraft',id);return {id,url:url.href};
}
export function loadRuntimeMapDefinition(options={}){
  const search=options.search??(browser()?window.location.search:''),params=new URLSearchParams(search);
  if(!params.has('mapDraft'))return {definition:createDefaultMapDocument(),isDraft:false,error:null,draftId:null};
  const draftId=params.get('mapDraft');
  try{
    if(params.getAll('mapDraft').length!==1||!draftId||!/^[a-zA-Z0-9_-]{8,80}$/.test(draftId))throw new Error('试玩链接无效。');
    const item=snapshotList(storageFor(options)).find(item=>item.id===draftId);
    if(!item)throw new Error('此试玩快照已被移除，或不属于当前浏览器。请返回编辑器重新试玩。');
    const now=options.now??Date.now();if(now-item.createdAt>PREVIEW_TTL_MS||item.createdAt>now+300000)throw new Error('此试玩快照已过期。请返回编辑器重新试玩。');
    const definition=normalizeMapDocument(item.document),validation=validateMapDocument(definition);
    if(!validation.valid)throw new Error(`快照无法运行：${validation.errors.map(error=>error.message).join(' ')}`);
    return {definition,isDraft:true,error:null,draftId};
  }catch(error){return {definition:null,isDraft:true,error:`地图试玩加载失败：${error.message}`,draftId};}
}
