import React from 'react';
import BrassPlate from '../../props/BrassPlate';
import { FURNITURE } from '../spatial-layout.mjs';
import { playSfx } from '../../props/sfx.mjs';
import './desk-tools.css';

const PRESETS = [['listen', '听歌'], ['work', '工作'], ['rest', '休息']];

// 布置小屋 as a toolbox tray and a paper catalogue: the tools lie along the lid (undo, redo, done), the
// layouts are blueprint cards, the furniture lies in the compartments of a steel tray, each on its own
// catalogue card. Every control is the same button it was, with the same name.
//
//   <DecorateTray
//     canUndo={store.canUndo} canRedo={store.canRedo} onUndo={store.undo} onRedo={store.redo} error={store.error}
//     onFinish={() => { setDrawer(''); setEditing(false); setSelected(''); }}   // 完成布置
//     onInRoom={() => setDrawer('')}                                            // 到屋内拖动
//     onPreset={(id) => commit(defaultLayout(look, id))}                        // 听歌 | 工作 | 休息
//     items={layout.items} selected={selected} onSelect={setSelected}
//     chosen={chosen}                                                           // layout.items.find(i => i.id === selected)
//     onTurn={() => mutate(() => placeFurniture(layout, chosen.id, { facing: chosen.facing === 'right' ? 'left' : 'right' }))}
//     onStow={() => { mutate(() => removeFurniture(layout, chosen.id)); setSelected(''); }}
//     onAdd={(type) => mutate(() => addFurniture(layout, type))}
//     onExport={exportLayout} onImport={importLayout}                           // 另存布局, 导入布局 (file input onChange)
//     onReset={() => commit(defaultLayout(look))}                               // 恢复默认
//   />
// Lives inside the same <Dialog title="布置小屋" className="home-tool home-editor"> as before.
export default function DecorateTray({ canUndo, canRedo, onUndo, onRedo, error, onFinish, onInRoom, presets = PRESETS, onPreset, items = [], selected = '', onSelect, chosen, onTurn, onStow, onAdd, onExport, onImport, onReset }) {
  const press = (fn) => (event) => { playSfx('key-press'); fn?.(event); };
  return <div className="toolbox-tray">
    <p className="tray-hint">拖动家具，或聚焦后用方向键微调。桌面小物会跟着桌子移动。</p>
    <div className="home-editor-actions tray-lid">
      <button type="button" className="tray-tool" disabled={!canUndo} onClick={press(onUndo)}>撤销</button>
      <button type="button" className="tray-tool" disabled={!canRedo} onClick={press(onRedo)}>重做</button>
      <BrassPlate as="button" type="button" className="tray-done" onClick={press(onFinish)}>完成布置</BrassPlate>
      <button type="button" className="tray-tool" onClick={press(onInRoom)}>到屋内拖动</button>
    </div>
    <fieldset className="tray-presets"><legend>完整布置预设</legend>{presets.map(([id, label]) => <button type="button" className="tray-card" key={id} onClick={press(() => onPreset?.(id))}>{label}</button>)}</fieldset>
    {chosen && FURNITURE[chosen.type] && <section className="home-editor-selection tray-chosen"><h3>{FURNITURE[chosen.type].name}</h3>
      <button type="button" className="tray-tool" onClick={press(onTurn)}>换个朝向</button>
      <button type="button" className="tray-tool" onClick={press(onStow)}>收起家具{FURNITURE[chosen.type].support ? '和桌面小物' : ''}</button>
    </section>}
    <div className="home-inventory tray-compartments">{Object.entries(FURNITURE).filter(([id]) => id !== 'fireplace').map(([id, spec]) => {
      const present = items.find((item) => item.type === id);
      return <button type="button" key={id} className={`tray-slot${present ? ' is-placed' : ''}`} aria-pressed={selected === present?.id} onClick={() => { playSfx('felt-pick'); if (present) onSelect?.(present.id); else onAdd?.(id); }}>
        <span>{spec.name}</span><small>{present ? '已摆放' : '＋添加'}</small>
      </button>;
    })}</div>
    <div className="home-editor-actions tray-foot">
      <button type="button" className="tray-tool" onClick={press(onExport)}>另存布局</button>
      <label className="home-file-button tray-tool">导入布局<input type="file" accept="application/json,.json" onChange={onImport}/></label>
      <button type="button" className="tray-tool" onClick={press(onReset)}>恢复默认</button>
    </div>
    {error && <p role="alert">{error}</p>}
  </div>;
}
