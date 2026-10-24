window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-steward',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const useState = React.useState
    const useEffect = React.useEffect
    const useMemo = React.useMemo
    const useRef = React.useRef

    const SELF_PACKAGE = '@local/dsh-plugin-steward'
    const UPDATES_PATH = '/dsh-plugin-steward/updates'
    const UPDATE_PATH = '/dsh-plugin-steward/update'
    const NS = 'pluginSteward'

    const CSS = `
.ps-page{width:100%;max-width:1040px;margin:0 auto;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.45;box-sizing:border-box}
.ps-page *{box-sizing:border-box}
.ps-page button,.ps-page input,.ps-page select{font:inherit}
.ps-page button{cursor:pointer}
.ps-page button:disabled{cursor:default;opacity:.48}
.ps-page :focus-visible,.ps-detail-badge:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.ps-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.ps-head-text{min-width:0;display:flex;flex-direction:column;gap:3px}
.ps-title{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em}
.ps-subtitle{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5;max-width:62ch}
.ps-statusline{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:18px;color:var(--dsw-alias-label-secondary);font-size:11.5px}
.ps-dot{width:6px;height:6px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary)}
.ps-dot[data-tone="success"]{background:var(--dsw-alias-state-success-primary)}
.ps-dot[data-tone="warn"]{background:var(--dsw-alias-state-warn-primary)}
.ps-dot[data-tone="error"]{background:var(--dsw-alias-state-error-primary)}
.ps-dot[data-tone="idle"]{background:var(--dsw-alias-state-idle-primary);animation:ps-pulse 1.2s ease-in-out infinite}
.ps-divider{color:var(--dsw-alias-border-l2)}
.ps-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ps-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 11px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;line-height:1;white-space:nowrap;transition:background .12s ease,border-color .12s ease,color .12s ease}
.ps-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}
.ps-primary{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 52%,var(--dsw-alias-border-l1));color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent)}
.ps-primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);border-color:var(--dsw-alias-brand-primary)}
.ps-ghost{border-color:transparent;color:var(--dsw-alias-label-secondary);background:transparent}
.ps-ghost:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.ps-light{border-color:transparent;background:transparent;color:var(--dsw-alias-brand-primary);padding:0 2px;height:auto;border-radius:2px;font-size:11.5px}
.ps-light:hover:not(:disabled){text-decoration:underline}
.ps-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ps-search{position:relative;display:flex;align-items:center;flex:1;min-width:220px}
.ps-search-icon{position:absolute;left:10px;display:flex;color:var(--dsw-alias-label-secondary);pointer-events:none}
.ps-search input{width:100%;height:34px;padding:0 12px 0 33px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12.5px;outline:none;transition:border-color .12s ease,box-shadow .12s ease}
.ps-search input::placeholder{color:var(--dsw-alias-label-secondary)}
.ps-search input:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}
.ps-sort{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap}
.ps-sort select{height:34px;padding:0 28px 0 10px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12.5px;outline:none;cursor:pointer}
.ps-sort select:focus{border-color:var(--dsw-alias-brand-primary)}
.ps-filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ps-chip{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border-radius:999px;border:.5px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1;transition:background .12s ease,color .12s ease}
.ps-chip:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.ps-chip[data-active="true"]{color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 11%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 28%,transparent)}
.ps-chip-count{min-width:15px;padding:1px 4px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10px;text-align:center}
.ps-chip[data-active="true"] .ps-chip-count{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 15%,transparent);color:var(--dsw-alias-brand-primary)}
.ps-notice{display:flex;align-items:flex-start;gap:8px;padding:9px 11px;border-radius:9px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:12px;color:var(--dsw-alias-label-primary)}
.ps-notice[data-tone="success"]{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 38%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 8%,var(--dsw-alias-bg-layer-1))}
.ps-notice[data-tone="warn"]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 40%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 8%,var(--dsw-alias-bg-layer-1))}
.ps-notice[data-tone="error"]{border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,var(--dsw-alias-bg-layer-1))}
.ps-update-callout{display:flex;align-items:center;gap:11px;padding:11px 13px;border-radius:10px;border:.5px solid color-mix(in srgb,var(--dsw-alias-state-warn-primary) 42%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 8%,var(--dsw-alias-bg-layer-1))}
.ps-callout-icon{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;flex:none;color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent)}
.ps-callout-copy{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
.ps-callout-copy strong{font-size:12.5px;font-weight:600}
.ps-callout-copy p{margin:0;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.45}
.ps-list{display:flex;flex-direction:column;gap:8px}
.ps-card{display:flex;flex-direction:column;gap:0;border:.5px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-layer-1);transition:border-color .12s ease,background .12s ease;overflow:hidden}
.ps-card:hover{border-color:var(--dsw-alias-border-l2)}
.ps-card[data-update="true"]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 38%,var(--dsw-alias-border-l1))}
.ps-card-head{display:flex;align-items:flex-start;gap:10px;padding:12px 13px 10px}
.ps-icon{position:relative;width:34px;height:34px;border-radius:9px;flex:none;display:flex;align-items:center;justify-content:center;overflow:hidden;color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,var(--dsw-alias-bg-layer-2));border:.5px solid var(--dsw-alias-border-l1);font-size:14px;font-weight:600;user-select:none}
.ps-icon img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:var(--dsw-alias-bg-layer-1)}
.ps-icon-fallback{line-height:1;text-transform:uppercase}
.ps-card-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.ps-title-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.ps-name{margin:0;font-size:13px;font-weight:600;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.ps-desc{margin:0;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ps-meta{display:flex;align-items:center;gap:0;flex-wrap:wrap;color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:1.5;margin-top:1px}
.ps-meta>span{min-width:0}
.ps-meta>span+span::before{content:"·";margin:0 6px;color:var(--dsw-alias-border-l2)}
.ps-version{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.ps-source{max-width:38ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ps-card-side{display:flex;align-items:center;gap:8px;flex:none;padding-top:1px}
.ps-tag{display:inline-flex;align-items:center;gap:3px;height:19px;padding:0 7px;border-radius:999px;border:.5px solid transparent;font-size:10px;line-height:1;white-space:nowrap;font-weight:500}
.ps-tag-neutral{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}
.ps-tag-update{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 13%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 30%,transparent)}
.ps-tag-brand{color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 11%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 26%,transparent)}
.ps-tag-idle{color:var(--dsw-alias-state-idle-primary);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}
.ps-tag-version{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:9.5px;opacity:.9}
.ps-switch{position:relative;display:inline-flex;align-items:center;width:34px;height:19px;flex:none;padding:0;border:0;border-radius:999px;background:var(--dsw-alias-border-l2);transition:background .14s ease;vertical-align:middle}
.ps-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}
.ps-switch:disabled{opacity:.42}
.ps-knob{display:block;width:15px;height:15px;margin-left:2px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:transform .14s ease;box-shadow:0 1px 2px color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent)}
.ps-switch[aria-checked="true"] .ps-knob{transform:translateX(15px)}
.ps-switch[data-busy="true"] .ps-knob{animation:ps-pulse 1s ease-in-out infinite}
.ps-inline-warning{display:flex;align-items:flex-start;gap:6px;margin:0 13px 10px;padding:7px 9px;border-radius:7px;font-size:11px;line-height:1.45;color:var(--dsw-alias-label-secondary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 7%,var(--dsw-alias-bg-layer-2));border:.5px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 26%,var(--dsw-alias-border-l1))}
.ps-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 13px 10px;min-height:26px;flex-wrap:wrap}
.ps-card-actions{display:flex;align-items:center;gap:6px;margin-left:auto}
.ps-update{height:24px;padding:0 9px;font-size:11px;border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,var(--dsw-alias-border-l1))}
.ps-update:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}
.ps-update-progress{display:flex;align-items:center;gap:7px;margin:0 13px 9px;padding:7px 9px;border-radius:7px;font-size:11px;line-height:1.45;color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,var(--dsw-alias-bg-layer-2));border:.5px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 25%,var(--dsw-alias-border-l1))}
.ps-failure{display:flex;flex-direction:column;gap:9px;padding:12px 13px;border-radius:11px;border:.5px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 42%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 7%,var(--dsw-alias-bg-layer-1))}
.ps-failure[data-tone="warn"]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 42%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 7%,var(--dsw-alias-bg-layer-1))}
.ps-failure-head{display:flex;align-items:flex-start;gap:9px}
.ps-failure-icon{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;flex:none;color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.ps-failure[data-tone="warn"] .ps-failure-icon{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent)}
.ps-failure-heading{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.ps-failure-heading strong{font-size:12.5px;font-weight:600}
.ps-failure-heading p{margin:0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.45}
.ps-failure-close{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:none;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:17px;line-height:1}
.ps-failure-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.ps-failure-reason{display:flex;flex-direction:column;gap:3px;padding:8px 9px;border-radius:7px;border:.5px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 72%,transparent)}
.ps-failure-reason strong{font-size:11.5px;font-weight:600}
.ps-failure-reason p{margin:0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.5;overflow-wrap:anywhere}
.ps-failure-code{align-self:flex-start;margin-top:1px;padding:1px 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:9.5px}
.ps-failure-rollback{margin:0;color:var(--dsw-alias-state-warn-primary);font-size:11px;line-height:1.5}
.ps-failure-rollback[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}
.ps-failure-rollback p{margin:0}
.ps-failure-rollback p+p{margin-top:2px;color:var(--dsw-alias-label-secondary)}
.ps-failure-more{color:var(--dsw-alias-label-secondary);font-size:11px}
.ps-failure-more summary{cursor:pointer;width:fit-content;border-radius:4px}
.ps-failure-more summary:hover{color:var(--dsw-alias-label-primary)}
.ps-failure-more pre{margin:6px 0 0;padding:8px 9px;max-height:190px;overflow:auto;border-radius:6px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.ps-failure-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ps-failure-help{color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:1.45}
.ps-row-toggle{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 5px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px}
.ps-row-toggle:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.ps-chevron{transition:transform .14s ease}
.ps-row-toggle[data-open="true"] .ps-chevron{transform:rotate(180deg)}
.ps-foot-count{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;padding:0 4px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:9.5px}
.ps-detail{height:24px;padding:0 7px;font-size:11px;gap:3px}
.ps-rows{display:flex;flex-direction:column;gap:2px;margin:0 13px 11px;padding:5px 0 2px;border-top:.5px solid var(--dsw-alias-border-l1)}
.ps-row{display:flex;align-items:center;gap:8px;padding:6px 7px;border-radius:7px;min-width:0;transition:background .1s ease}
.ps-row:hover{background:var(--dsw-alias-bg-layer-2)}
.ps-row-mark{width:5px;height:5px;border-radius:50%;flex:none;background:var(--dsw-alias-state-idle-primary);opacity:.7}
.ps-row[data-live="true"] .ps-row-mark{background:var(--dsw-alias-state-success-primary);opacity:1}
.ps-row[data-failed="true"] .ps-row-mark{background:var(--dsw-alias-state-error-primary);opacity:1}
.ps-row-text{min-width:0;flex:1;display:flex;flex-direction:column;gap:1px}
.ps-row-title{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.ps-row-name{font-size:11.5px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.ps-row-state{font-size:9.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.ps-row-state[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}
.ps-row-module{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:9.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.ps-rows-empty{margin:0;padding:5px 7px 7px;color:var(--dsw-alias-label-secondary);font-size:11px}
.ps-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:34px 20px;border:.5px dashed var(--dsw-alias-border-l2);border-radius:11px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 55%,transparent);text-align:center}
.ps-empty-icon{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
.ps-empty strong{font-size:12.5px;font-weight:500}
.ps-empty p{margin:0;color:var(--dsw-alias-label-secondary);font-size:11.5px}
.ps-empty[data-tone="error"] .ps-empty-icon{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,var(--dsw-alias-bg-layer-2))}
.ps-error-detail{max-width:70ch;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ps-skeleton{display:flex;flex-direction:column;gap:8px}
.ps-skel-card{display:flex;gap:10px;padding:13px;border:.5px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-layer-1)}
.ps-skel-icon{width:34px;height:34px;border-radius:9px;flex:none}
.ps-skel-lines{flex:1;display:flex;flex-direction:column;gap:6px;padding-top:2px}
.ps-skel-line{height:8px;border-radius:4px}
.ps-skel-line.short{width:37%}
.ps-skel-line.mid{width:64%}
.ps-skel-shimmer{background:linear-gradient(90deg,var(--dsw-alias-bg-layer-2) 0%,var(--dsw-alias-bg-layer-1) 45%,var(--dsw-alias-bg-layer-2) 100%);background-size:220% 100%;animation:ps-shimmer 1.5s linear infinite}
.ps-footnote{margin:2px 0 2px;color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:1.5}
.ps-spinner{display:inline-block;width:11px;height:11px;border-radius:50%;border:1.5px solid color-mix(in srgb,currentColor 25%,transparent);border-top-color:currentColor;animation:ps-spin .8s linear infinite;flex:none}
.ps-detail-badge{display:inline-flex;align-items:center;gap:4px;vertical-align:middle;margin-left:2px}
@keyframes ps-spin{to{transform:rotate(360deg)}}
@keyframes ps-shimmer{0%{background-position:120% 0}100%{background-position:-120% 0}}
@keyframes ps-pulse{0%,100%{opacity:.48}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.ps-page *,.ps-detail-badge{animation:none!important;transition:none!important}}
@media (max-width:620px){.ps-head-actions{width:100%}.ps-head-actions .ps-btn{flex:1}.ps-search{width:100%;flex-basis:100%}.ps-sort{width:100%;justify-content:space-between}.ps-sort select{flex:1}.ps-card-head{gap:8px}.ps-card-side{gap:5px}.ps-source{max-width:24ch}}
`

    const zh = {
      tab: '插件管家',
      title: '插件管家',
      subtitle: '搜索、排序并开关已安装的插件；发布新版本时标出「可更新」。',
      searchLabel: '搜索已安装插件',
      searchPlaceholder: '搜索插件、包名或组件…',
      filterLabel: '筛选插件',
      filterAll: '全部',
      filterEnabled: '已启用',
      filterDisabled: '已停用',
      filterUpdates: '可更新',
      sortLabel: '排序',
      sortNameAsc: '名称 A → Z',
      sortNameDesc: '名称 Z → A',
      sortEnabledFirst: '启用优先',
      sortUpdatesFirst: '更新优先',
      refresh: '刷新',
      checkUpdates: '检查更新',
      checking: '正在检查更新…',
      retry: '重试',
      clearFilters: '清除筛选',
      loading: '正在读取已安装插件…',
      loadFailed: '无法读取已安装插件。',
      empty: '还没有安装其他插件。',
      emptySearch: '没有匹配的插件。',
      emptyUpdates: '没有可更新的插件。',
      summary: '{total} 个已安装 · {enabled} 个启用',
      summaryUpdates: '{total} 个已安装 · {enabled} 个启用 · {updates} 个可更新',
      updatesFound: '{count} 个插件可以更新',
      allCurrent: '所有可检查的插件都是最新版本',
      checkNotRun: '尚未检查更新',
      updateCheckFailed: '更新检查失败',
      lastChecked: '上次检查 {time}',
      partialCheck: '{count} 个未能检查',
      updateBadge: '可更新',
      updateTo: '可更新至 {version}',
      checkFailedTag: '未检查',
      updateHint: '点「更新」会下载并安装新版本；下载或安装失败会自动回滚。',
      updateAction: '更新到 v{version}',
      updating: '正在更新…',
      updatingHint: '正在拉取 v{version}；失败会自动回滚，请不要关闭页面。',
      updatedToast: '已把 {name} 更新到 v{version}。',
      updatedRestartToast: '已安装 {name} v{version}，重启后生效。',
      rolledBackToast: '更新 {name} 失败，已回滚到 v{version}。',
      rolledBackRestartToast: '更新 {name} 失败，已安装回 v{version}；重启后完成回滚。',
      rollbackFailedToast: '更新 {name} 失败，自动回滚也未完成：{reason}。请到官方插件页手动重装 v{version}。',
      updateFailedToast: '更新 {name} 失败：{reason}',
      updateFailureTitle: '更新失败',
      updateFailureTarget: '{name}：v{from} → v{to}',
      updateFailureReason: '失败原因',
      updateFailureCode: '错误代码',
      updateFailureRolledBack: '已自动回滚到 v{version}。',
      updateFailureRollbackFailed: '自动回滚未完成，请到官方插件页手动重装 v{version}。',
      updateFailureRollbackReason: '回滚失败原因',
      updateFailureStages: '查看诊断信息',
      updateFailureDismiss: '关闭失败详情',
      updateFailureCopy: '复制原因',
      updateFailureCopied: '已复制',
      updateFailureHelp: '可以把这段信息发给插件作者。',
      updateFailureUnknown: '更新服务没有返回具体原因。',
      failureNotUpdatable: '没有可用的新版本，或该插件不是 registry 安装。',
      failureVersionChanged: '可更新版本已变化，请重新检查更新。',
      failureInvalidTarget: '目标版本无效或不是更高版本。',
      failureNotInstalled: '插件已不在当前 profile 中。',
      failureReadOnly: '该插件不允许自动更新。',
      failureExternalSource: '该插件不是从 npm registry 安装的。',
      failureInProgress: '已有更新任务正在运行。',
      failureRemoveFailed: '移除旧版本失败。',
      failureInstallFailed: '安装新版本失败。',
      failureVerifyFailed: '安装后的版本校验失败。',
      failureRollbackFailed: '自动回滚失败。',
      failureNetwork: '无法连接更新服务。',
      failureForbidden: '更新请求被拒绝。',
      failureInvalidRequest: '更新请求格式无效。',
      failureUnknownCode: '更新失败。',
      restartReasonNoHmr: '这个 profile 只在启动时应用更改。',
      restartReasonPackageMoved: '已安装的插件包解析到了另一个目录，或更改替换了 DSH 自带的包。',
      restartReasonHostModule: '更改涉及 DSH 自身已加载的模块。',
      restartReasonUnmanagedPlugin: '更改涉及一个不受插件列表管理的插件。',
      restartReasonModuleComparison: 'DSH 无法将已加载的插件与磁盘上的文件进行比较。',
      unknownVersion: '版本未知',
      enabledTag: '已启用',
      disabledTag: '已停用',
      selfTag: '当前插件',
      officialTag: '官方',
      readOnlyTag: '只读',
      components: '{count} 个组件',
      showRows: '查看组件',
      hideRows: '收起组件',
      rowsEmpty: '这个插件没有可单独开关的组件。',
      details: '详情',
      bundleEnable: '开启 {name}',
      bundleDisable: '关闭 {name}',
      rowEnable: '开启组件 {name}',
      rowDisable: '关闭组件 {name}',
      readOnly: '这项由系统管理，不能在这里修改。',
      selfProtected: '当前插件的开关被锁定，避免把自己关掉。',
      bundleOffHint: '先开启插件，才能单独控制组件。',
      notLive: '未加载',
      loadingState: '加载中',
      startFailed: '启动失败',
      enabledToast: '已开启 {name}',
      disabledToast: '已关闭 {name}',
      savedRestart: '已保存 {name}，重启后生效。',
      overridden: '{name} 的设置被更高优先级的配置覆盖。',
      failedToast: '{name} 操作失败：{reason}',
      cancelledToast: '{name} 操作已取消。',
      localSource: '本地安装',
      externalSource: '外部来源',
      unknownSource: '来源未知',
      bundleError: '插件载入异常：{reason}',
      metaError: '显示信息读取失败：{reason}',
      unknownError: '未知错误',
      footerNote: '更新会先移除旧版本再安装新版本；任何一步失败都会尝试回滚。本地、链接和 Git 安装不会检查或自动更新。',
    }

    const en = {
      tab: 'Plugin Steward',
      title: 'Plugin Steward',
      subtitle: 'Search, sort, and switch installed plugins; newer releases are marked “Update available”.',
      searchLabel: 'Search installed plugins',
      searchPlaceholder: 'Search plugins, packages, or components…',
      filterLabel: 'Filter plugins',
      filterAll: 'All',
      filterEnabled: 'On',
      filterDisabled: 'Off',
      filterUpdates: 'Updates',
      sortLabel: 'Sort',
      sortNameAsc: 'Name A → Z',
      sortNameDesc: 'Name Z → A',
      sortEnabledFirst: 'Enabled first',
      sortUpdatesFirst: 'Updates first',
      refresh: 'Refresh',
      checkUpdates: 'Check updates',
      checking: 'Checking updates…',
      retry: 'Retry',
      clearFilters: 'Clear filters',
      loading: 'Reading installed plugins…',
      loadFailed: 'Could not read installed plugins.',
      empty: 'No other plugins are installed yet.',
      emptySearch: 'No matching plugins.',
      emptyUpdates: 'No plugins have an available update.',
      summary: '{total} installed · {enabled} on',
      summaryUpdates: '{total} installed · {enabled} on · {updates} with updates',
      updatesFound: 'Updates available: {count}',
      allCurrent: 'Everything checkable is up to date',
      checkNotRun: 'Updates have not been checked yet',
      updateCheckFailed: 'Update check failed',
      lastChecked: 'checked {time}',
      partialCheck: '{count} could not be checked',
      updateBadge: 'Update available',
      updateTo: 'Version {version} is available',
      checkFailedTag: 'Not checked',
      updateHint: '“Update” downloads and installs the new version; a failed download or install rolls back automatically.',
      updateAction: 'Update to v{version}',
      updating: 'Updating…',
      updatingHint: 'Fetching v{version}; failures roll back automatically. Keep this page open.',
      updatedToast: 'Updated {name} to v{version}.',
      updatedRestartToast: 'Installed {name} v{version}; it takes effect after a restart.',
      rolledBackToast: 'Updating {name} failed and rolled back to v{version}.',
      rolledBackRestartToast: 'Updating {name} failed; v{version} is installed and the rollback completes after a restart.',
      rollbackFailedToast: 'Updating {name} failed and automatic rollback did not finish: {reason}. Reinstall v{version} from the official Plugins page.',
      updateFailedToast: 'Updating {name} failed: {reason}',
      updateFailureTitle: 'Update failed',
      updateFailureTarget: '{name}: v{from} → v{to}',
      updateFailureReason: 'Reason',
      updateFailureCode: 'Error code',
      updateFailureRolledBack: 'Rolled back to v{version} automatically.',
      updateFailureRollbackFailed: 'Automatic rollback did not finish. Reinstall v{version} from the official Plugins page.',
      updateFailureRollbackReason: 'Rollback failure',
      updateFailureStages: 'Show diagnostics',
      updateFailureDismiss: 'Dismiss failure details',
      updateFailureCopy: 'Copy reason',
      updateFailureCopied: 'Copied',
      updateFailureHelp: 'You can send this information to the plugin author.',
      updateFailureUnknown: 'The update service did not return a specific reason.',
      failureNotUpdatable: 'No newer version is available, or this plugin is not installed from a registry.',
      failureVersionChanged: 'The available version changed; check for updates again.',
      failureInvalidTarget: 'The target version is invalid or not newer.',
      failureNotInstalled: 'The plugin is no longer installed in this profile.',
      failureReadOnly: 'This plugin cannot be updated automatically.',
      failureExternalSource: 'This plugin was not installed from an npm registry.',
      failureInProgress: 'Another update is already running.',
      failureRemoveFailed: 'Removing the old version failed.',
      failureInstallFailed: 'Installing the new version failed.',
      failureVerifyFailed: 'The installed version did not match the requested version.',
      failureRollbackFailed: 'Automatic rollback failed.',
      failureNetwork: 'Could not reach the update service.',
      failureForbidden: 'The update request was refused.',
      failureInvalidRequest: 'The update request was malformed.',
      failureUnknownCode: 'The update failed.',
      restartReasonNoHmr: 'This profile applies changes only at startup.',
      restartReasonPackageMoved: 'The installed package resolves to another directory, or the change replaced a package shipped with DSH.',
      restartReasonHostModule: 'The change touches modules already loaded by DSH.',
      restartReasonUnmanagedPlugin: 'The change touches a plugin that is not managed by the plugin list.',
      restartReasonModuleComparison: 'DSH could not compare the loaded plugins with the files on disk.',
      unknownVersion: 'Version unknown',
      enabledTag: 'On',
      disabledTag: 'Off',
      selfTag: 'This plugin',
      officialTag: 'Official',
      readOnlyTag: 'Read-only',
      components: '{count} components',
      showRows: 'Show components',
      hideRows: 'Hide components',
      rowsEmpty: 'This plugin has no individually switchable components.',
      details: 'Details',
      bundleEnable: 'Turn on {name}',
      bundleDisable: 'Turn off {name}',
      rowEnable: 'Turn on component {name}',
      rowDisable: 'Turn off component {name}',
      readOnly: 'This item is managed by the system and cannot be changed here.',
      selfProtected: 'This plugin cannot switch itself off.',
      bundleOffHint: 'Turn the plugin on before changing its components.',
      notLive: 'Not loaded',
      loadingState: 'Loading',
      startFailed: 'Failed to start',
      enabledToast: 'Turned on {name}',
      disabledToast: 'Turned off {name}',
      savedRestart: 'Saved {name}; it takes effect after a restart.',
      overridden: 'A higher-priority layer overrides the setting for {name}.',
      failedToast: '{name} failed: {reason}',
      cancelledToast: '{name} was cancelled.',
      localSource: 'Local install',
      externalSource: 'External source',
      unknownSource: 'Source unknown',
      bundleError: 'Plugin load error: {reason}',
      metaError: 'Display metadata error: {reason}',
      unknownError: 'Unknown error',
      footerNote: 'Updates remove the old version before installing the new one and try to roll back if any step fails. Local, linked, and Git installs are neither checked nor auto-updated.',
    }

    function createStore(initial) {
      let state = initial
      const listeners = new Set()
      return {
        get() {
          return state
        },
        set(next) {
          state = next
          for (const listener of listeners) listener()
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    }

    const updatesStore = createStore({
      status: 'idle',
      packages: {},
      checkedAt: 0,
      error: null,
    })
    let updatesPromise = null
    let updatesController = null
    let disposed = false

    function messageOf(error) {
      if (error && typeof error === 'object' && typeof error.message === 'string') return error.message
      return String(error)
    }

    function unwrap(result, label) {
      if (result && result.ok === true) return result.value
      if (result && result.ok === false) {
        throw new Error(`${label}: ${result.error?.message || result.error?.code || 'Remote call failed'}`)
      }
      return result
    }

    async function readInventory(remote) {
      const [bundleResult, pluginResult] = await Promise.all([
        remote.pluginManager.listBundles(),
        remote.pluginManager.listPlugins(),
      ])
      const bundles = unwrap(bundleResult, 'listBundles')
      const plugins = unwrap(pluginResult, 'listPlugins')
      return {
        bundles: (Array.isArray(bundles) ? bundles : []).filter((bundle) => (
          bundle
          && bundle.installed === true
          && bundle.availability === 'profile'
        )),
        plugins: Array.isArray(plugins) ? plugins : [],
      }
    }

    function ensureUpdates(force) {
      if (updatesPromise !== null) return updatesPromise
      if (disposed) return Promise.resolve(null)

      const previous = updatesStore.get()
      updatesStore.set({
        ...previous,
        status: previous.checkedAt > 0 ? 'refreshing' : 'loading',
        error: null,
      })

      const controller = new AbortController()
      updatesController = controller
      const url = force ? `${UPDATES_PATH}?refresh=1` : UPDATES_PATH

      const run = (async () => {
        const response = await fetch(url, {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        })
        let payload = null
        try {
          payload = await response.json()
        } catch {
          // The status check below reports the malformed response.
        }
        if (!response.ok) {
          const detail = payload && typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`
          throw new Error(detail)
        }
        if (payload === null || typeof payload !== 'object' || payload.packages === null || typeof payload.packages !== 'object') {
          throw new Error('Invalid update response')
        }
        if (!disposed) {
          updatesStore.set({
            status: 'ready',
            packages: payload.packages,
            checkedAt: typeof payload.checkedAt === 'number' ? payload.checkedAt : Date.now(),
            error: null,
          })
        }
        return payload
      })().catch((error) => {
        if (!disposed) {
          const current = updatesStore.get()
          updatesStore.set({
            ...current,
            status: current.checkedAt > 0 ? 'ready' : 'error',
            error: messageOf(error),
          })
        }
        return null
      }).finally(() => {
        if (updatesPromise === run) updatesPromise = null
        if (updatesController === controller) updatesController = null
      })

      updatesPromise = run
      return run
    }

    function useUpdates() {
      const [snapshot, setSnapshot] = useState(updatesStore.get)
      useEffect(() => {
        const sync = () => setSnapshot(updatesStore.get())
        sync()
        return updatesStore.subscribe(sync)
      }, [])
      return snapshot
    }

    function IconSearch({ size = 15 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
      },
      h('circle', { cx: 7, cy: 7, r: 4.4, stroke: 'currentColor', strokeWidth: 1.4 }),
      h('path', { d: 'm10.4 10.4 3.2 3.2', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }))
    }

    function IconRefresh({ size = 13 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
      },
      h('path', {
        d: 'M13 8a5 5 0 1 1-1.5-3.6M13 3.5V6h-2.5',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    function IconUpdate({ size = 13 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
      },
      h('path', {
        d: 'M8 13V3M4.7 6.3 8 3l3.3 3.3',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    function IconChevron({ size = 12 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true', className: 'ps-chevron',
      },
      h('path', {
        d: 'm4 6.2 4 4 4-4',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    function IconArrow({ size = 12 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
      },
      h('path', {
        d: 'M3 8h9M8.5 4.5 12 8l-3.5 3.5',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    function IconAlert({ size = 14 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
      },
      h('circle', { cx: 8, cy: 8, r: 6.2, stroke: 'currentColor', strokeWidth: 1.3 }),
      h('path', { d: 'M8 4.8v4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      h('circle', { cx: 8, cy: 11.2, r: 0.8, fill: 'currentColor' }))
    }

    function IconBox({ size = 24 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true',
      },
      h('path', {
        d: 'M4 8.2 12 4l8 4.2v7.6L12 20l-8-4.2V8.2Z',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinejoin: 'round',
      }),
      h('path', {
        d: 'M4.3 8.4 12 12.6l7.7-4.2M12 12.6V20',
        stroke: 'currentColor',
        strokeWidth: 1.3,
        strokeLinejoin: 'round',
      }))
    }

    function Spinner() {
      return h('span', { className: 'ps-spinner', 'aria-hidden': 'true' })
    }

    function Tag({ tone = 'neutral', title, children }) {
      return h('span', { className: `ps-tag ps-tag-${tone}`, title }, children)
    }

    function Switch({ checked, disabled, label, title, busy, onChange }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked === true,
        'aria-label': label,
        className: 'ps-switch',
        disabled: disabled === true,
        title,
        'data-busy': busy === true ? 'true' : undefined,
        onClick: (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (disabled !== true) onChange(checked !== true)
        },
      }, h('span', { className: 'ps-knob', 'aria-hidden': 'true' }))
    }

    function moduleShortName(name) {
      if (typeof name !== 'string' || name === '') return ''
      const base = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name
      return base
        .replace(/^cordis:/, '')
        .replace(/^cordis-plugin-/, '')
        .replace(/^dsh-(?:host-|client-)?/, '')
    }

    function localizedField(meta, field, fallback, resolveText) {
      const value = meta && meta[field]
      if (value === undefined || value === null) return fallback
      if (typeof value === 'string') return value === '' ? fallback : value
      if (typeof value === 'object') {
        try {
          const resolved = resolveText(value)
          return typeof resolved === 'string' && resolved !== '' ? resolved : fallback
        } catch {
          return fallback
        }
      }
      return fallback
    }

    function sourceLabel(source, t) {
      if (typeof source !== 'string' || source === '') return t('unknownSource')
      if (/^(?:file|link|workspace|portal):/i.test(source)) return t('localSource')
      if (/^(?:git\+|git:|github:|gitlab:|bitbucket:|https?:|npm:)/i.test(source)) return t('externalSource')
      return source
    }

    function formatTime(timestamp) {
      if (typeof timestamp !== 'number' || timestamp <= 0) return ''
      try {
        return new Intl.DateTimeFormat(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(timestamp))
      } catch {
        return ''
      }
    }

    function countUpdates(packages) {
      let count = 0
      for (const name of Object.keys(packages || {})) {
        if (packages[name] && packages[name].status === 'update') count += 1
      }
      return count
    }

    function reasonText(error, t) {
      if (!error) return t('unknownError')
      if (typeof error === 'string') return error
      return error.diagnostic || error.code || t('unknownError')
    }

    function describeChange(change, name, next, t) {
      if (!change || change.application === undefined) {
        return { tone: 'success', text: t(next ? 'enabledToast' : 'disabledToast', { name }) }
      }
      if (change.application === 'applied') {
        return { tone: 'success', text: t(next ? 'enabledToast' : 'disabledToast', { name }) }
      }
      if (change.application === 'restart-required') {
        return { tone: 'warn', text: t('savedRestart', { name }) }
      }
      if (change.application === 'overridden') {
        return { tone: 'warn', text: t('overridden', { name }) }
      }
      if (change.application === 'cancelled') {
        return { tone: 'warn', text: t('cancelledToast', { name }) }
      }
      return {
        tone: 'error',
        text: t('failedToast', { name, reason: reasonText(change.error, t) }),
      }
    }

    function describeUpdate(result, name, t) {
      if (!result || typeof result !== 'object') {
        return { tone: 'error', text: t('updateFailedToast', { name, reason: t('unknownError') }) }
      }
      if (result.status === 'updated') {
        return {
          tone: result.overridden ? 'warn' : 'success',
          text: t('updatedToast', { name, version: result.toVersion }),
        }
      }
      if (result.status === 'restart-required') {
        const reason = restartReasonLabel(result.restartReason, t)
        return {
          tone: 'warn',
          text: t('updatedRestartToast', { name, version: result.toVersion })
            + (reason === '' ? '' : ` ${reason}`),
        }
      }
      if (result.status === 'rolled-back') {
        return {
          tone: 'warn',
          text: t(result.rollbackRestartRequired ? 'rolledBackRestartToast' : 'rolledBackToast', {
            name,
            version: result.fromVersion,
          }),
        }
      }
      if (result.status === 'rollback-failed') {
        return {
          tone: 'error',
          text: t('rollbackFailedToast', {
            name,
            version: result.fromVersion,
            reason: result.rollbackReason || result.rollbackError || result.failure?.detail || t('unknownError'),
          }),
        }
      }
      return {
        tone: 'error',
        text: t('updateFailedToast', {
          name,
          reason: result.reason || (result.failure && result.failure.detail) || t('unknownError'),
        }),
      }
    }

    const RESTART_REASON_KEYS = {
      'no-hmr': 'restartReasonNoHmr',
      'package-moved': 'restartReasonPackageMoved',
      'host-module': 'restartReasonHostModule',
      'unmanaged-plugin': 'restartReasonUnmanagedPlugin',
      'module-comparison': 'restartReasonModuleComparison',
    }

    function restartReasonLabel(reason, t) {
      if (typeof reason !== 'string' || reason === '') return ''
      const key = RESTART_REASON_KEYS[reason]
      return key === undefined ? reason : t(key)
    }

    const FAILURE_CODE_KEYS = {
      'not-updatable': 'failureNotUpdatable',
      'version-changed': 'failureVersionChanged',
      'invalid-target': 'failureInvalidTarget',
      'not-installed': 'failureNotInstalled',
      'read-only': 'failureReadOnly',
      'external-source': 'failureExternalSource',
      'update-in-progress': 'failureInProgress',
      'remove-failed': 'failureRemoveFailed',
      'install-failed': 'failureInstallFailed',
      'verify-failed': 'failureVerifyFailed',
      'rollback-failed': 'failureRollbackFailed',
      'network': 'failureNetwork',
      'forbidden': 'failureForbidden',
      'missing-update-intent': 'failureForbidden',
      'invalid-body': 'failureInvalidRequest',
      'invalid-json': 'failureInvalidRequest',
      'unsupported-media-type': 'failureInvalidRequest',
      'body-too-large': 'failureInvalidRequest',
      'update-failed': 'failureUnknownCode',
    }

    function failureCodeLabel(code, t) {
      const key = FAILURE_CODE_KEYS[code]
      return key === undefined ? (code || t('failureUnknownCode')) : t(key)
    }

    function stagesText(stages) {
      if (!Array.isArray(stages)) return ''
      return stages.map((stage) => {
        const parts = [String(stage.stage || 'stage')]
        if (typeof stage.application === 'string') parts.push(stage.application)
        if (stage.changed === false) parts.push('changed=false')
        if (typeof stage.restartReason === 'string' && stage.restartReason !== '') {
          parts.push(`restart=${stage.restartReason}`)
        }
        if (typeof stage.error === 'string' && stage.error !== '') parts.push(stage.error)
        if (Array.isArray(stage.warnings) && stage.warnings.length > 0) {
          parts.push(stage.warnings.join('; '))
        }
        return parts.join(' · ')
      }).join('\n')
    }

    function failureFromResult(result, title) {
      const failure = result && result.failure && typeof result.failure === 'object'
        ? result.failure
        : {}
      const status = result && typeof result.status === 'string' ? result.status : 'failed'
      return {
        name: result && typeof result.name === 'string' ? result.name : '',
        title,
        fromVersion: result && typeof result.fromVersion === 'string' ? result.fromVersion : '',
        toVersion: result && typeof result.toVersion === 'string' ? result.toVersion : '',
        status,
        code: typeof failure.code === 'string'
          ? failure.code
          : (status === 'rollback-failed' ? 'rollback-failed' : 'update-failed'),
        reason: result && typeof result.reason === 'string'
          ? result.reason
          : (typeof failure.detail === 'string' ? failure.detail : ''),
        rollbackReason: result && typeof result.rollbackReason === 'string'
          ? result.rollbackReason
          : (result && typeof result.rollbackError === 'string' ? result.rollbackError : ''),
        stages: result && Array.isArray(result.stages) ? result.stages : [],
      }
    }

    function failureFromHttp(payload, view, target, error, fallbackCode = 'network') {
      const code = payload && typeof payload.error === 'string' ? payload.error : fallbackCode
      const reason = payload && typeof payload.reason === 'string'
        ? payload.reason
        : (payload && typeof payload.detail === 'string'
          ? payload.detail
          : (error ? messageOf(error) : ''))
      return {
        name: view.bundle.name,
        title: view.title,
        fromVersion: typeof view.bundle.version === 'string' ? view.bundle.version : '',
        toVersion: target,
        status: 'failed',
        code,
        reason,
        rollbackReason: '',
        stages: [],
      }
    }

    function UpdateFailurePanel({ failure, t, onDismiss }) {
      const [copied, setCopied] = useState(false)
      const reason = failure.reason || t('updateFailureUnknown')
      const codeLabel = failureCodeLabel(failure.code, t)
      const diagnostics = stagesText(failure.stages)
      const target = t('updateFailureTarget', {
        name: failure.title || failure.name || 'Plugin',
        from: failure.fromVersion || '?',
        to: failure.toVersion || '?',
      })
      const copyText = [
        `${target}`,
        `${t('updateFailureReason')}: ${reason}`,
        `${t('updateFailureCode')}: ${failure.code || 'unknown'}`,
        failure.rollbackReason ? `${t('updateFailureRollbackReason')}: ${failure.rollbackReason}` : '',
        diagnostics ? `${t('updateFailureStages')}:\n${diagnostics}` : '',
      ].filter(Boolean).join('\n')

      async function copyReason() {
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(copyText)
            setCopied(true)
          }
        } catch {
          // Clipboard permission is optional; the reason remains on screen.
        }
      }

      const rollbackFailed = failure.status === 'rollback-failed'
      const rolledBack = failure.status === 'rolled-back'
      const tone = rollbackFailed ? 'error' : rolledBack ? 'warn' : 'error'

      return h('section', {
        className: 'ps-failure',
        'data-tone': tone,
        role: 'alert',
        'aria-label': t('updateFailureTitle'),
      },
      h('div', { className: 'ps-failure-head' },
        h('span', { className: 'ps-failure-icon', 'aria-hidden': 'true' }, h(IconAlert, { size: 16 })),
        h('div', { className: 'ps-failure-heading' },
          h('strong', null, t('updateFailureTitle')),
          h('p', null, target)),
        h('button', {
          type: 'button',
          className: 'ps-failure-close',
          'aria-label': t('updateFailureDismiss'),
          title: t('updateFailureDismiss'),
          onClick: onDismiss,
        }, '×')),
      h('div', { className: 'ps-failure-reason' },
        h('strong', null, codeLabel),
        h('p', null, reason),
        h('code', { className: 'ps-failure-code' }, failure.code || 'unknown')),
      rolledBack
        ? h('p', { className: 'ps-failure-rollback' },
          t('updateFailureRolledBack', { version: failure.fromVersion || '?' }))
        : null,
      rollbackFailed
        ? h('div', { className: 'ps-failure-rollback', 'data-tone': 'error' },
          h('p', null, t('updateFailureRollbackFailed', { version: failure.fromVersion || '?' })),
          failure.rollbackReason
            ? h('p', null, `${t('updateFailureRollbackReason')}: ${failure.rollbackReason}`)
            : null)
        : null,
      diagnostics === '' ? null : h('details', { className: 'ps-failure-more' },
        h('summary', null, t('updateFailureStages')),
        h('pre', null, diagnostics)),
      h('div', { className: 'ps-failure-actions' },
        h('button', {
          type: 'button',
          className: 'ps-btn ps-ghost',
          onClick: () => { void copyReason() },
        }, copied ? t('updateFailureCopied') : t('updateFailureCopy')),
        h('span', { className: 'ps-failure-help' }, t('updateFailureHelp'))))
    }

    function BundleCard({
      view,
      t,
      resolveText,
      expanded,
      busyKeys,
      updating,
      updatingAny,
      onToggleExpand,
      onToggleBundle,
      onToggleRow,
      onUpdate,
      openPackage,
    }) {
      const { bundle, title, description, rows, updateInfo } = view
      const isUpdate = updateInfo !== undefined
        && updateInfo.status === 'update'
        && typeof updateInfo.latest === 'string'
        && updateInfo.latest !== ''
      const updateUnchecked = updateInfo !== undefined && updateInfo.status === 'unknown'
      const isSelf = bundle.name === SELF_PACKAGE
      const isBusy = busyKeys[`bundle:${bundle.name}`] === true
      const isReadOnly = bundle.readOnlyReason !== undefined || isSelf
      const isUpdating = updating === true
      const canUpdate = isUpdate
        && !isSelf
        && !isReadOnly
        && bundle.removable !== false
        && typeof onUpdate === 'function'
      const switchTitle = isSelf
        ? t('selfProtected')
        : isReadOnly
          ? t('readOnly')
          : undefined
      const icon = bundle.meta && typeof bundle.meta.icon === 'string' ? bundle.meta.icon : null
      const updatedVersion = isUpdate && typeof updateInfo.latest === 'string' ? updateInfo.latest : ''
      const errorReason = bundle.error ? reasonText(bundle.error, t) : null
      const metaReason = bundle.meta && bundle.meta.error ? String(bundle.meta.error) : null

      return h('article', {
        className: 'ps-card',
        'data-update': isUpdate ? 'true' : undefined,
        'data-enabled': bundle.enabled === true ? 'true' : 'false',
      },
      h('div', { className: 'ps-card-head' },
        h('span', { className: 'ps-icon', 'aria-hidden': 'true' },
          h('span', { className: 'ps-icon-fallback' }, title.slice(0, 1)),
          icon === null ? null : h('img', {
            src: icon,
            alt: '',
            loading: 'lazy',
            onError: (event) => { event.currentTarget.style.display = 'none' },
          })),
        h('div', { className: 'ps-card-main' },
          h('div', { className: 'ps-title-row' },
            h('h3', { className: 'ps-name', title: bundle.name }, title),
            isUpdate ? h(Tag, {
              tone: 'warn',
              title: t('updateTo', { version: updatedVersion }),
            },
            h(IconUpdate, { size: 10 }),
            t('updateBadge'),
            updatedVersion === '' ? null : h('span', { className: 'ps-tag-version' }, `v${updatedVersion}`)) : null,
            updateUnchecked ? h(Tag, {
              tone: 'neutral',
              title: updateInfo.reason || t('updateCheckFailed'),
            }, t('checkFailedTag')) : null,
            isSelf ? h(Tag, { tone: 'brand' }, t('selfTag')) : null,
            bundle.enabled === false ? h(Tag, { tone: 'idle' }, t('disabledTag')) : null,
            isReadOnly && !isSelf ? h(Tag, { tone: 'neutral' }, t('readOnlyTag')) : null,
            bundle.official === true && !isSelf ? h(Tag, { tone: 'neutral' }, t('officialTag')) : null),
          description === '' ? null : h('p', { className: 'ps-desc', title: description }, description),
          h('div', { className: 'ps-meta' },
            h('span', { className: 'ps-version' }, bundle.version ? `v${bundle.version}` : t('unknownVersion')),
            h('span', { className: 'ps-source', title: bundle.source || '' }, sourceLabel(bundle.source, t)),
            h('span', null, t('components', { count: rows.length })))),
        h('div', { className: 'ps-card-side' },
          isUpdating || isBusy ? h(Spinner) : null,
          h(Switch, {
            checked: bundle.enabled === true,
            disabled: isReadOnly || isBusy || updatingAny,
            label: bundle.enabled ? t('bundleDisable', { name: title }) : t('bundleEnable', { name: title }),
            title: switchTitle,
            busy: isBusy || isUpdating,
            onChange: () => onToggleBundle(view),
          }))),
      errorReason === null ? null : h('div', { className: 'ps-inline-warning' },
        h('span', null, t('bundleError', { reason: errorReason }))),
      metaReason === null ? null : h('div', { className: 'ps-inline-warning' },
        h('span', null, t('metaError', { reason: metaReason }))),
      isUpdating
        ? h('div', { className: 'ps-update-progress', role: 'status' },
          h(Spinner),
          h('span', null, t('updatingHint', { version: updatedVersion || '—' })))
        : null,
      h('div', { className: 'ps-card-foot' },
        rows.length > 0
          ? h('button', {
            type: 'button',
            className: 'ps-row-toggle',
            'aria-expanded': expanded === true,
            'data-open': expanded === true ? 'true' : undefined,
            onClick: () => onToggleExpand(bundle.name),
          },
          h(IconChevron),
          expanded === true ? t('hideRows') : t('showRows'),
          h('span', { className: 'ps-foot-count' }, String(rows.length)))
          : h('span', { className: 'ps-foot-count', title: t('rowsEmpty') }, '0'),
        h('div', { className: 'ps-card-actions' },
          canUpdate
            ? h('button', {
              type: 'button',
              className: 'ps-btn ps-primary ps-update',
              onClick: () => onUpdate(view),
              disabled: updatingAny === true || updating === true,
              title: t('updateAction', { version: updatedVersion }),
            },
            isUpdating || updating === true ? h(Spinner) : h(IconUpdate),
            isUpdating ? t('updating') : t('updateAction', { version: updatedVersion }))
            : null,
          typeof openPackage === 'function'
            ? h('button', {
              type: 'button',
              className: 'ps-btn ps-ghost ps-detail',
              onClick: () => openPackage(bundle.name),
            }, t('details'), h(IconArrow, { size: 10 }))
            : null)),
      expanded === true && rows.length > 0
        ? h('div', { className: 'ps-rows' }, rows.map((rowView) => {
          const plugin = rowView.plugin
          const row = rowView.row
          const rowKey = row.entryId || row.rowId || row.moduleName
          const rowBusy = busyKeys[`row:${rowKey}`] === true
          const rowLive = plugin !== undefined && plugin.enabled === true
          const rowFailed = plugin !== undefined && plugin.fiberPhase === 'failed'
          const rowLoading = plugin !== undefined && (plugin.fiberPhase === 'loading' || plugin.fiberPhase === 'unloading')
          const rowState = rowFailed
            ? t('startFailed')
            : rowLoading
              ? t('loadingState')
              : plugin === undefined
                ? t('notLive')
                : plugin.enabled
                  ? t('enabledTag')
                  : t('disabledTag')
          const rowDisabled = isSelf
            || updatingAny === true
            || bundle.enabled !== true
            || plugin === undefined
            || plugin.readOnlyReason !== undefined
            || typeof plugin.patchId !== 'string'
            || rowBusy
          const rowTitle = isSelf
            ? t('selfProtected')
            : updatingAny === true
              ? t('updating')
              : bundle.enabled !== true
                ? t('bundleOffHint')
                : plugin === undefined
                  ? t('notLive')
                  : plugin.readOnlyReason !== undefined
                    ? t('readOnly')
                    : undefined
          return h('div', {
            className: 'ps-row',
            key: rowKey,
            'data-live': rowLive ? 'true' : undefined,
            'data-failed': rowFailed ? 'true' : undefined,
          },
          h('span', { className: 'ps-row-mark', 'aria-hidden': 'true' }),
          h('div', { className: 'ps-row-text' },
            h('div', { className: 'ps-row-title' },
              h('span', { className: 'ps-row-name', title: row.title }, rowView.title),
              h('span', {
                className: 'ps-row-state',
                'data-tone': rowFailed ? 'error' : undefined,
              }, rowState)),
            h('code', { className: 'ps-row-module', title: row.moduleName }, row.moduleName)),
          rowBusy ? h(Spinner) : null,
          h(Switch, {
            checked: plugin !== undefined && plugin.enabled === true,
            disabled: rowDisabled,
            label: plugin !== undefined && plugin.enabled
              ? t('rowDisable', { name: rowView.title })
              : t('rowEnable', { name: rowView.title }),
            title: rowTitle,
            busy: rowBusy,
            onChange: () => onToggleRow(view, rowView),
          }))
        }))
        : null)
    }

    function StewardTab(props) {
      const p = props || {}
      const openPackage = p.openPackage
      const loadInventory = p.readInventory
      const setBundleEnabled = p.setBundleEnabled
      const setPluginEnabled = p.setPluginEnabled
      const [state, setState] = useState({ status: 'loading', bundles: [], plugins: [], error: null })
      const [query, setQuery] = useState('')
      const [filter, setFilter] = useState('all')
      const [sort, setSort] = useState('nameAsc')
      const [expandedNames, setExpandedNames] = useState(() => new Set())
      const [busyKeys, setBusyKeys] = useState({})
      const [notice, setNotice] = useState(null)
      const [updating, setUpdating] = useState(null)
      const [updateFailure, setUpdateFailure] = useState(null)
      const updateState = useUpdates()
      const loadGeneration = useRef(0)
      const updateInFlight = useRef(false)
      const translate = typeof p.t === 'function' ? p.t : ((key) => key)
      const resolveText = typeof p.resolveText === 'function' ? p.resolveText : ((text) => text)
      const openTarget = typeof openPackage === 'function' ? openPackage : null
      const queryText = query.trim().toLocaleLowerCase()
      const pluginByEntry = useMemo(() => {
        const map = new Map()
        for (const plugin of state.plugins) {
          if (plugin && typeof plugin.entryId === 'string') map.set(plugin.entryId, plugin)
        }
        return map
      }, [state.plugins])

      async function refresh() {
        const generation = loadGeneration.current + 1
        loadGeneration.current = generation
        setState((previous) => ({
          ...previous,
          status: previous.bundles.length > 0 ? 'refreshing' : 'loading',
          error: null,
        }))
        try {
          const data = await loadInventory()
          if (generation !== loadGeneration.current) return
          setState({
            status: 'ready',
            bundles: data.bundles,
            plugins: data.plugins,
            error: null,
          })
        } catch (error) {
          if (generation !== loadGeneration.current) return
          setState((previous) => ({
            ...previous,
            status: previous.bundles.length > 0 ? 'ready' : 'error',
            error: messageOf(error),
          }))
        }
      }

      useEffect(() => {
        void refresh()
        if (updatesStore.get().status === 'idle') void ensureUpdates(false)
        return () => {
          loadGeneration.current += 1
        }
      }, [])

      useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(() => setNotice(null), 6000)
        return () => clearTimeout(timer)
      }, [notice])

      async function toggleBundle(view) {
        const key = `bundle:${view.bundle.name}`
        if (busyKeys[key] || updating !== null) return
        if (typeof setBundleEnabled !== 'function') return
        const next = view.bundle.enabled !== true
        setBusyKeys((previous) => ({ ...previous, [key]: true }))
        try {
          const result = await setBundleEnabled(view.bundle.name, next)
          const change = unwrap(result, 'setBundleEnabled')
          setNotice(describeChange(change, view.title, next, translate))
          await refresh()
        } catch (error) {
          setNotice({
            tone: 'error',
            text: translate('failedToast', { name: view.title, reason: messageOf(error) }),
          })
        } finally {
          setBusyKeys((previous) => {
            const nextBusy = { ...previous }
            delete nextBusy[key]
            return nextBusy
          })
        }
      }

      async function toggleRow(view, rowView) {
        const plugin = rowView.plugin
        if (!plugin || typeof plugin.patchId !== 'string') return
        if (typeof setPluginEnabled !== 'function') return
        const key = `row:${rowView.row.entryId || rowView.row.rowId || rowView.row.moduleName}`
        if (busyKeys[key] || updating !== null) return
        const next = plugin.enabled !== true
        setBusyKeys((previous) => ({ ...previous, [key]: true }))
        try {
          const result = await setPluginEnabled(plugin.patchId, next)
          const change = unwrap(result, 'setPluginEnabled')
          setNotice(describeChange(change, rowView.title, next, translate))
          await refresh()
        } catch (error) {
          setNotice({
            tone: 'error',
            text: translate('failedToast', { name: rowView.title, reason: messageOf(error) }),
          })
        } finally {
          setBusyKeys((previous) => {
            const nextBusy = { ...previous }
            delete nextBusy[key]
            return nextBusy
          })
        }
      }

      async function runUpdate(view) {
        if (updateInFlight.current || updating !== null) return
        const target = view.updateInfo && typeof view.updateInfo.latest === 'string'
          ? view.updateInfo.latest
          : ''
        if (target === '' || view.bundle.name === SELF_PACKAGE) return

        updateInFlight.current = true
        setUpdating({ name: view.bundle.name, version: target })
        setUpdateFailure(null)
        setNotice(null)
        try {
          const response = await fetch(UPDATE_PATH, {
            method: 'POST',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: {
              'content-type': 'application/json',
              'x-plugin-steward-update': '1',
            },
            body: JSON.stringify({ name: view.bundle.name, version: target }),
          })
          let payload = null
          try {
            payload = await response.json()
          } catch {
            // The status check below produces a useful message.
          }
          if (!response.ok || payload === null || payload.ok !== true) {
            const failure = failureFromHttp(payload, view, target, null, 'update-failed')
            setUpdateFailure(failure)
            setNotice({
              tone: 'error',
              text: translate('updateFailedToast', {
                name: view.title,
                reason: failure.reason || translate('unknownError'),
              }),
            })
            void refresh()
            void ensureUpdates(true)
            return
          }

          const result = payload.result
          if (!result || typeof result !== 'object') {
            const failure = failureFromHttp(null, view, target, new Error(translate('unknownError')), 'update-failed')
            setUpdateFailure(failure)
            setNotice({
              tone: 'error',
              text: translate('updateFailedToast', {
                name: view.title,
                reason: failure.reason,
              }),
            })
            void refresh()
            void ensureUpdates(true)
            return
          }

          if (result.status === 'rolled-back' || result.status === 'rollback-failed' || result.status === 'failed') {
            setUpdateFailure(failureFromResult(result, view.title))
          } else {
            setUpdateFailure(null)
          }
          setNotice(describeUpdate(result, view.title, translate))
          await refresh()
          await ensureUpdates(true)
        } catch (error) {
          const failure = failureFromHttp(null, view, target, error)
          setUpdateFailure(failure)
          setNotice({
            tone: 'error',
            text: translate('updateFailedToast', { name: view.title, reason: failure.reason }),
          })
          void refresh()
          void ensureUpdates(true)
        } finally {
          updateInFlight.current = false
          setUpdating(null)
        }
      }

      function toggleExpanded(name) {
        setExpandedNames((previous) => {
          const next = new Set(previous)
          if (next.has(name)) next.delete(name)
          else next.add(name)
          return next
        })
      }

      const views = state.bundles.map((bundle) => {
        const title = localizedField(bundle.meta, 'title', bundle.name, resolveText)
        const description = localizedField(bundle.meta, 'description', '', resolveText)
        const rows = (Array.isArray(bundle.rows) ? bundle.rows : []).map((row) => {
          const rowTitle = localizedField(row.meta, 'title', moduleShortName(row.moduleName), resolveText)
          const rowDescription = localizedField(row.meta, 'description', '', resolveText)
          return {
            row,
            plugin: row.entryId ? pluginByEntry.get(row.entryId) : undefined,
            title: rowTitle,
            description: rowDescription,
            searchText: [row.rowId, row.moduleName, rowTitle, rowDescription].filter(Boolean).join('\n').toLocaleLowerCase(),
          }
        })
        const updateInfo = updateState.packages[bundle.name]
        return {
          bundle,
          title,
          description,
          rows,
          updateInfo,
          searchText: [
            title,
            description,
            bundle.name,
            bundle.source,
            ...rows.map((row) => row.searchText),
          ].filter(Boolean).join('\n').toLocaleLowerCase(),
        }
      })

      const totalCount = views.length
      const enabledCount = views.filter((view) => view.bundle.enabled === true).length
      const updateCount = views.filter((view) => view.updateInfo && view.updateInfo.status === 'update').length
      const unknownCount = views.filter((view) => view.updateInfo && view.updateInfo.status === 'unknown').length
      const updateBusy = updateState.status === 'loading' || updateState.status === 'refreshing'
      const updateTime = formatTime(updateState.checkedAt)

      let checkText = translate('checkNotRun')
      if (updateBusy) {
        checkText = translate('checking')
      } else if (updateState.error) {
        checkText = updateTime === ''
          ? translate('updateCheckFailed')
          : `${translate('updateCheckFailed')} · ${translate('lastChecked', { time: updateTime })}`
      } else if (updateCount > 0) {
        checkText = translate('updatesFound', { count: updateCount })
        if (unknownCount > 0) checkText += ` · ${translate('partialCheck', { count: unknownCount })}`
      } else if (updateState.checkedAt > 0) {
        checkText = translate('allCurrent')
        if (unknownCount > 0) checkText += ` · ${translate('partialCheck', { count: unknownCount })}`
      }

      const statusTone = updateBusy
        ? 'idle'
        : updateState.error
          ? 'error'
          : updateCount > 0
            ? 'warn'
            : updateState.checkedAt > 0
              ? 'success'
              : 'idle'

      const countsText = updateCount > 0
        ? translate('summaryUpdates', {
          total: totalCount,
          enabled: enabledCount,
          updates: updateCount,
        })
        : translate('summary', { total: totalCount, enabled: enabledCount })

      const filteredViews = views.filter((view) => {
        if (queryText !== '' && !view.searchText.includes(queryText)) return false
        if (filter === 'enabled' && view.bundle.enabled !== true) return false
        if (filter === 'disabled' && view.bundle.enabled === true) return false
        if (filter === 'updates' && !(view.updateInfo && view.updateInfo.status === 'update')) return false
        return true
      })

      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
      filteredViews.sort((left, right) => {
        if (sort === 'updatesFirst') {
          const rank = (view) => {
            if (view.updateInfo && view.updateInfo.status === 'update') return 0
            if (view.updateInfo && view.updateInfo.status === 'current') return 1
            return 2
          }
          const difference = rank(left) - rank(right)
          if (difference !== 0) return difference
        }
        if (sort === 'enabledFirst') {
          const difference = Number(right.bundle.enabled === true) - Number(left.bundle.enabled === true)
          if (difference !== 0) return difference
        }
        const compared = collator.compare(left.title, right.title)
        return sort === 'nameDesc' ? -compared : compared
      })

      const filterItems = [
        { id: 'all', label: translate('filterAll'), count: totalCount },
        { id: 'enabled', label: translate('filterEnabled'), count: enabledCount },
        { id: 'disabled', label: translate('filterDisabled'), count: totalCount - enabledCount },
        { id: 'updates', label: translate('filterUpdates'), count: updateCount },
      ]

      const emptyText = state.bundles.length === 0
        ? translate('empty')
        : filter === 'updates' && updateCount === 0
          ? translate('emptyUpdates')
          : translate('emptySearch')

      return h('section', { className: 'ps-page', 'aria-label': translate('title') },
        h('div', { className: 'ps-head' },
          h('div', { className: 'ps-head-text' },
            h('h2', { className: 'ps-title' }, translate('title')),
            h('p', { className: 'ps-subtitle' }, translate('subtitle')),
            h('div', { className: 'ps-statusline' },
              h('span', { className: 'ps-dot', 'data-tone': statusTone, 'aria-hidden': 'true' }),
              h('span', null, countsText),
              h('span', { className: 'ps-divider', 'aria-hidden': 'true' }, '·'),
              h('span', { title: updateState.error || undefined }, checkText),
              updateState.error
                ? h('button', {
                  type: 'button',
                  className: 'ps-btn ps-light',
                  onClick: () => { void ensureUpdates(true) },
                  disabled: updateBusy,
                }, translate('retry'))
                : null)),
          h('div', { className: 'ps-head-actions' },
            h('button', {
              type: 'button',
              className: 'ps-btn ps-ghost',
              onClick: () => { void refresh() },
              disabled: state.status === 'loading' || state.status === 'refreshing',
            },
            state.status === 'refreshing' ? h(Spinner) : h(IconRefresh),
            translate('refresh')),
            h('button', {
              type: 'button',
              className: 'ps-btn ps-primary',
              onClick: () => { void ensureUpdates(true) },
              disabled: updateBusy,
            },
            updateBusy ? h(Spinner) : h(IconUpdate),
            updateBusy ? translate('checking') : translate('checkUpdates')))),
        updateFailure === null ? null : h(UpdateFailurePanel, {
          failure: updateFailure,
          t: translate,
          onDismiss: () => setUpdateFailure(null),
        }),
        notice === null ? null : h('div', {
          className: 'ps-notice',
          'data-tone': notice.tone,
          role: 'status',
        }, h('span', null, notice.text)),
        updateCount > 0
          ? h('div', { className: 'ps-update-callout' },
            h('span', { className: 'ps-callout-icon' }, h(IconUpdate, { size: 16 })),
            h('div', { className: 'ps-callout-copy' },
              h('strong', null, translate('updatesFound', { count: updateCount })),
              h('p', null, translate('updateHint'))),
            h('button', {
              type: 'button',
              className: 'ps-btn ps-ghost',
              onClick: () => setFilter(filter === 'updates' ? 'all' : 'updates'),
            }, filter === 'updates' ? translate('filterAll') : translate('filterUpdates')))
          : null,
        h('div', { className: 'ps-toolbar' },
          h('label', { className: 'ps-search' },
            h('span', { className: 'ps-search-icon' }, h(IconSearch)),
            h('input', {
              type: 'search',
              value: query,
              placeholder: translate('searchPlaceholder'),
              'aria-label': translate('searchLabel'),
              onChange: (event) => setQuery(event.target.value),
            })),
          h('label', { className: 'ps-sort' },
            h('span', null, translate('sortLabel')),
            h('select', {
              value: sort,
              'aria-label': translate('sortLabel'),
              onChange: (event) => setSort(event.target.value),
            },
            h('option', { value: 'nameAsc' }, translate('sortNameAsc')),
            h('option', { value: 'nameDesc' }, translate('sortNameDesc')),
            h('option', { value: 'enabledFirst' }, translate('sortEnabledFirst')),
            h('option', { value: 'updatesFirst' }, translate('sortUpdatesFirst'))))),
        h('div', { className: 'ps-filters', role: 'group', 'aria-label': translate('filterLabel') },
          filterItems.map((item) => h('button', {
            type: 'button',
            className: 'ps-chip',
            key: item.id,
            'data-active': filter === item.id ? 'true' : undefined,
            'aria-pressed': filter === item.id,
            onClick: () => setFilter(item.id),
          }, item.label, h('span', { className: 'ps-chip-count' }, String(item.count))))),
        state.status === 'loading'
          ? h('div', { className: 'ps-skeleton', 'aria-busy': 'true', 'aria-label': translate('loading') },
            [0, 1, 2].map((index) => h('div', { className: 'ps-skel-card', key: String(index) },
              h('span', { className: 'ps-skel-icon ps-skel-shimmer' }),
              h('div', { className: 'ps-skel-lines' },
                h('span', { className: 'ps-skel-line short ps-skel-shimmer' }),
                h('span', { className: 'ps-skel-line mid ps-skel-shimmer' }),
                h('span', { className: 'ps-skel-line short ps-skel-shimmer' })))))
          : state.status === 'error' && state.bundles.length === 0
            ? h('div', { className: 'ps-empty', 'data-tone': 'error' },
              h('span', { className: 'ps-empty-icon' }, h(IconBox, { size: 21 })),
              h('strong', null, translate('loadFailed')),
              state.error ? h('span', { className: 'ps-error-detail', title: state.error }, state.error) : null,
              h('button', {
                type: 'button',
                className: 'ps-btn ps-primary',
                onClick: () => { void refresh() },
              }, translate('retry')))
            : filteredViews.length === 0
              ? h('div', { className: 'ps-empty' },
                h('span', { className: 'ps-empty-icon' }, h(IconBox, { size: 21 })),
                h('strong', null, emptyText),
                (queryText !== '' || filter !== 'all') && state.bundles.length > 0
                  ? h('button', {
                    type: 'button',
                    className: 'ps-btn ps-ghost',
                    onClick: () => { setQuery(''); setFilter('all') },
                  }, translate('clearFilters'))
                  : null)
              : h('div', { className: 'ps-list' }, filteredViews.map((view) => h(BundleCard, {
                key: view.bundle.name,
                view,
                t: translate,
                resolveText,
                expanded: expandedNames.has(view.bundle.name)
                  || (queryText !== '' && view.rows.some((row) => row.searchText.includes(queryText))),
                busyKeys,
                updating: updating !== null && updating.name === view.bundle.name,
                updatingAny: updating !== null,
                onToggleExpand: toggleExpanded,
                onToggleBundle: toggleBundle,
                onToggleRow: toggleRow,
                onUpdate: runUpdate,
                openPackage: openTarget,
              }))),
        h('p', { className: 'ps-footnote' }, translate('footerNote')))
    }

    function UpdateBadge({ subject, t }) {
      const updateState = useUpdates()
      const name = subject && subject.kind === 'bundle' && subject.pkg && typeof subject.pkg.name === 'string'
        ? subject.pkg.name
        : null

      useEffect(() => {
        if (name !== null && updatesStore.get().status === 'idle') {
          void ensureUpdates(false)
        }
      }, [name])

      if (name === null) return null
      const info = updateState.packages[name]
      if (!info || info.status !== 'update' || typeof info.latest !== 'string') return null
      const label = typeof t === 'function' ? t : ((key) => key)
      return h('span', {
        className: 'ps-tag ps-tag-update ps-detail-badge',
        title: label('updateTo', { version: info.latest }),
      },
      h(IconUpdate, { size: 10 }),
      label('updateBadge'),
      h('span', { className: 'ps-tag-version' }, `v${info.latest}`))
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-steward: dictionaries')

      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {}
        const style = document.createElement('style')
        style.dataset.plugin = SELF_PACKAGE
        style.textContent = CSS
        document.head.appendChild(style)
        return () => style.remove()
      }, 'dsh-plugin-steward: styles')

      ctx.effect(() => () => {
        disposed = true
        if (updatesController !== null) updatesController.abort()
      }, 'dsh-plugin-steward: update check cleanup')

      const tabProps = () => ({
        t,
        resolveText: (text) => ctx.locale.resolveText(text),
        readInventory: () => readInventory(ctx.remote),
        setBundleEnabled: (name, enabled) => ctx.remote.pluginManager.setBundleEnabled(name, enabled),
        setPluginEnabled: (id, enabled) => ctx.remote.pluginManager.setPluginEnabled(id, enabled),
      })

      ctx.slots.inject('plugins.tab', () => ctx.slots.register({
        name: 'plugins.tab',
        id: 'plugin-steward',
        order: 20,
        label: () => t('tab'),
        locale: NS,
        inject: tabProps,
      }, StewardTab))

      ctx.slots.inject('plugins.detail.badge', () => ctx.slots.register({
        name: 'plugins.detail.badge',
        id: 'plugin-steward-update',
        order: 20,
        label: () => t('updateBadge'),
        locale: NS,
        inject: () => ({ t }),
      }, UpdateBadge))
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.pluginManager'],
      apply,
    }
  },
})
