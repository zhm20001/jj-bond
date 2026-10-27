import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ContextMenuState,
  DensityMode,
  GraphLayout,
  GrowthDirection,
  PendingConfirm,
} from '../types';
import {
  formatChangeIdDisplay,
  laneColor,
  rowLeftPad,
  rowMetrics,
  visualRow,
} from '../types';
import { formatTsRelativeThenAbsolute, labelRev } from '../i18n';
import { useI18n } from '../I18nContext';
import {
  curvePath,
  dragCurve as computeDragCurve,
  type Point,
} from '../drag/curve';
import { linearRangeIds, orderSelectedByGraph } from '../selection';

interface Props {
  layout: GraphLayout | null;
  density: DensityMode;
  growth: GrowthDirection;
  selected: string[];
  onSelect: (ids: string[]) => void;
  onDoubleClick: (changeId: string) => void;
  onRequestConfirm: (pending: PendingConfirm) => void;
  onOpenContextMenu: (menu: ContextMenuState) => void;
  /** Open the OS directory picker (desktop only); omitted in browser mode. */
  onOpenPicker?: () => void;
}

interface DragState {
  mode: 'rebase' | 'at';
  sourceId: string;
  sourceIds: string[];
  sourceIdx: number;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
  targetIdx: number | null;
}

export function GraphCanvas({
  layout,
  density,
  growth,
  selected,
  onSelect,
  onDoubleClick,
  onRequestConfirm,
  onOpenContextMenu,
  onOpenPicker,
}: Props) {
  const { t, locale } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  /** Latest drag gesture, updated on every pointer move without re-rendering. */
  const dragRef = useRef<DragState | null>(null);
  const dragPathRef = useRef<SVGPathElement | null>(null);
  const dragArrowRef = useRef<SVGPathElement | null>(null);
  /** Index of the shift-select anchor in layout.nodes. */
  const selectAnchorIdx = useRef<number | null>(null);
  const m = rowMetrics(density === 'compact');
  const n = layout?.nodes.length ?? 0;
  const graphW = m.graphPad * 2 + m.laneW * Math.max(1, layout?.laneCount ?? 1);
  const height = Math.max(120, n * m.rowH + 16);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const nodeCenters = useMemo(() => {
    if (!layout) return [] as { x: number; y: number }[];
    return layout.nodes.map((node) => {
      const vr = visualRow(node.row, n, growth);
      const y = 8 + vr * m.rowH + m.rowH / 2;
      const x = m.graphPad + m.laneW * node.lane + m.laneW / 2;
      return { x, y };
    });
  }, [layout, n, growth, m]);

  const hitIndex = useCallback(
    (clientX: number, clientY: number) => {
      const el = scrollRef.current;
      if (!el || !layout) return null;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left + el.scrollLeft;
      const y = clientY - rect.top + el.scrollTop;
      for (let i = 0; i < layout.nodes.length; i++) {
        const vr = visualRow(layout.nodes[i].row, n, growth);
        const top = 8 + vr * m.rowH;
        if (y >= top && y <= top + m.rowH && x >= 0) return i;
      }
      return null;
    },
    [layout, n, growth, m],
  );

  // Suppress text selection for the whole drag gesture (browsers ignore CSS alone).
  useEffect(() => {
    if (!drag) return;
    const blockSelect = (ev: Event) => {
      ev.preventDefault();
    };
    document.addEventListener('selectstart', blockSelect, true);
    document.body.classList.add('jj-dragging');
    window.getSelection()?.removeAllRanges();
    return () => {
      document.removeEventListener('selectstart', blockSelect, true);
      document.body.classList.remove('jj-dragging');
    };
  }, [drag]);

  const onPointerDown = (e: React.PointerEvent, idx: number, atChip = false) => {
    if (!layout) return;
    // Ignore right/middle click so context menu does not start a drag.
    if (e.button !== 0) return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    const node = layout.nodes[idx];
    const id = node.rev.changeId;
    const shift = e.shiftKey;
    const toggle = e.metaKey || e.ctrlKey;

    let nextSelected = selected;
    if (atChip) {
      nextSelected = [id];
      selectAnchorIdx.current = idx;
      onSelect(nextSelected);
    } else if (shift && selectAnchorIdx.current !== null) {
      nextSelected = linearRangeIds(layout.nodes, selectAnchorIdx.current, idx);
      onSelect(nextSelected);
    } else if (toggle) {
      const set = new Set(selected);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      nextSelected = orderSelectedByGraph(layout.nodes, [...set]);
      selectAnchorIdx.current = idx;
      onSelect(nextSelected);
    } else if (selected.includes(id) && selected.length > 0) {
      // Click on an already-selected row: keep multi-selection for drag (GG).
      nextSelected = selected;
    } else {
      nextSelected = [id];
      selectAnchorIdx.current = idx;
      onSelect(nextSelected);
    }

    const center = nodeCenters[idx];
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const sourceIds =
      nextSelected.includes(id) && nextSelected.length > 0
        ? orderSelectedByGraph(layout.nodes, nextSelected)
        : [id];
    const mode: DragState['mode'] = atChip ? 'at' : 'rebase';
    const next: DragState = {
      mode,
      sourceId: id,
      sourceIds,
      sourceIdx: idx,
      startX: center.x,
      startY: center.y,
      curX: center.x,
      curY: center.y,
      targetIdx: null,
    };
    dragRef.current = next;
    setDrag(next);
  };

  /** Preview arc + stroke color for a drag gesture in any freshness. */
  const dragPreview = (d: DragState): { d: string; stroke: string } => {
    const start: Point = { x: d.startX, y: d.startY };
    let end: Point;
    let stroke = 'var(--pink)';
    if (d.targetIdx !== null) {
      const c = nodeCenters[d.targetIdx];
      end = { x: c.x, y: c.y };
      stroke = 'var(--green)';
    } else {
      end = { x: d.curX, y: d.curY };
    }
    return { d: curvePath(computeDragCurve(start, end)), stroke };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag || !layout) return;
    window.getSelection()?.removeAllRanges();
    const el = scrollRef.current!;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left + el.scrollLeft;
    const y = e.clientY - rect.top + el.scrollTop;
    const ti = hitIndex(e.clientX, e.clientY);
    const targetIdx = ti !== null && ti !== drag.sourceIdx ? ti : null;
    // Hot path: repaint the preview arc imperatively from the ref instead of
    // re-rendering the whole graph on every mouse move; state only changes on
    // a row crossing so the drop-target highlight follows the hovered row.
    const cur: DragState = { ...(dragRef.current ?? drag), curX: x, curY: y, targetIdx };
    dragRef.current = cur;
    const preview = dragPreview(cur);
    dragPathRef.current?.setAttribute('d', preview.d);
    dragPathRef.current?.setAttribute('stroke', preview.stroke);
    dragArrowRef.current?.setAttribute('fill', preview.stroke);
    if (targetIdx !== drag.targetIdx) {
      setDrag(cur);
    }
  };

  const cancelDrag = () => {
    dragRef.current = null;
    setDrag(null);
  };

  const finishDrag = (e: React.PointerEvent) => {
    // Read the gesture from the ref: the state copy may lag the last moves.
    const d = dragRef.current ?? drag;
    dragRef.current = null;
    if (!d || !layout) {
      setDrag(null);
      return;
    }
    const moved =
      Math.hypot(d.curX - d.startX, d.curY - d.startY) > 6;
    const ti = hitIndex(e.clientX, e.clientY);
    if (moved && ti !== null && ti !== d.sourceIdx) {
      const dst = layout.nodes[ti].rev;
      if (d.mode === 'at') {
        onRequestConfirm({
          kind: 'atTransfer',
          targetId: dst.changeId,
          immutable: dst.immutable,
          sourceLabel: '@',
          targetLabel: labelRev(locale, dst.changeId, dst.description),
        });
      } else {
        const sourceIds = d.sourceIds.length
          ? d.sourceIds
          : [d.sourceId];
        // Don't rebase onto a commit inside the moving set.
        if (sourceIds.includes(dst.changeId)) {
          setDrag(null);
          return;
        }
        const byId = new Map(layout.nodes.map((n) => [n.rev.changeId, n.rev]));
        const newest = sourceIds[0];
        const oldest = sourceIds[sourceIds.length - 1];
        const newestRev = byId.get(newest);
        const oldestRev = byId.get(oldest);
        const sourceLabel =
          sourceIds.length === 1
            ? labelRev(locale, newest, newestRev?.description ?? '')
            : `${labelRev(locale, oldest, oldestRev?.description ?? '')}  …  ${labelRev(locale, newest, newestRev?.description ?? '')}${t('graph.multiSource', { n: sourceIds.length })}`;
        onRequestConfirm({
          kind: 'rebase',
          sourceIds,
          targetId: dst.changeId,
          sourceLabel,
          targetLabel: labelRev(locale, dst.changeId, dst.description),
        });
      }
    }
    setDrag(null);
  };

  const onRowContextMenu = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!layout) return;
    dragRef.current = null;
    setDrag(null);
    const id = layout.nodes[idx].rev.changeId;
    let nextSelected = selected;
    if (!selected.includes(id)) {
      nextSelected = [id];
      selectAnchorIdx.current = idx;
      onSelect(nextSelected);
    }
    const revisionIds = orderSelectedByGraph(layout.nodes, nextSelected);
    onOpenContextMenu({
      x: e.clientX,
      y: e.clientY,
      revisionIds,
    });
  };

  if (!layout) {
    return (
      <div className="graph-empty">
        <p>{t('graph.empty')}</p>
        <p className="muted">{t('graph.emptyHint', { path: '/path/to/repository' })}</p>
        {onOpenPicker && (
          <button
            type="button"
            className="btn primary graph-empty-open"
            onClick={onOpenPicker}
          >
            {t('graph.openRepoPicker')}
          </button>
        )}
      </div>
    );
  }

  const edgePaths = layout.edges.map((edge, i) => {
    // nodes[i].row === i, so fromRow/toRow are array indices.
    const from = nodeCenters[edge.fromRow];
    const to = nodeCenters[edge.toRow];
    if (!from || !to) return null;
    const color = laneColor(edge.colorLane);
    let d: string;
    if (Math.abs(from.x - to.x) < 0.5) {
      d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    } else {
      const midY = (from.y + to.y) / 2;
      d = `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
    }
    return <path key={i} d={d} stroke={color} strokeWidth={2} fill="none" opacity={0.85} />;
  });

  // GG-style drag curve: bulges RIGHT; endpoint is the target node center.
  // Computed from state on start/row-crossing; between those, pointer moves
  // update the path imperatively (see onPointerMove).
  const preview = drag ? dragPreview(dragRef.current ?? drag) : null;

  // Overlay wide enough for the rightward bulge (handle ≤ 72).
  const dragSvgW = Math.max(graphW + 8 + 96, 480);

  return (
    <div className="graph-root">
    <div
      className={`graph-scroll${drag ? ' is-dragging' : ''}`}
      ref={scrollRef}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
    >
      <div className="graph-inner" style={{ minHeight: height }}>
        <svg
          className="graph-svg"
          width={graphW + 8}
          height={height}
          style={{ width: graphW + 8, minWidth: graphW + 8 }}
        >
          {edgePaths}
          {layout.nodes.map((node, idx) => {
            const c = nodeCenters[idx];
            const color = laneColor(node.lane);
            const isSel = selectedSet.has(node.rev.changeId);
            const kind: NodeGlyphKind = node.rev.isWorkingCopy
              ? 'wc'
              : node.rev.immutable
                ? 'immutable'
                : 'commit';
            return (
              <g key={node.rev.changeId}>
                <NodeGlyph
                  x={c.x}
                  y={c.y}
                  r={m.nodeR + (isSel ? 1.5 : 0)}
                  kind={kind}
                  color={color}
                  selected={isSel}
                />
              </g>
            );
          })}
        </svg>
        {preview && (
          <svg
            className="graph-drag-svg"
            width={dragSvgW}
            height={height}
            style={{ width: dragSvgW, minWidth: dragSvgW }}
          >
            <defs>
              <marker
                id="jj-drag-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path ref={dragArrowRef} d="M 0 0 L 10 5 L 0 10 z" fill={preview.stroke} />
              </marker>
            </defs>
            <path
              ref={dragPathRef}
              d={preview.d}
              stroke={preview.stroke}
              strokeWidth={2.5}
              fill="none"
              strokeDasharray="6 4"
              markerEnd="url(#jj-drag-arrow)"
              style={{ filter: 'drop-shadow(0 0 3px rgba(245,194,231,0.45))' }}
            />
          </svg>
        )}
        <div className="graph-rows">
          {layout.nodes.map((node, idx) => {
            const vr = visualRow(node.row, n, growth);
            const isSel = selectedSet.has(node.rev.changeId);
            const color = laneColor(node.lane);
            const leftPad = rowLeftPad(node.lane, node.padding ?? 0, m.laneW, m.graphPad);
            const { prefix, rest: displayRest } = formatChangeIdDisplay(
              node.rev.changeId,
              node.rev.uniquePrefixLen ?? 1,
            );
            return (
              <div
                key={node.rev.changeId}
                className={`rev-row ${density} ${isSel ? 'selected' : ''} ${
                  drag?.targetIdx === idx ? 'drop-target' : ''
                }${node.rev.conflict ? ' conflict' : ''}`}
                style={{
                  top: 8 + vr * m.rowH,
                  height: m.rowH,
                  paddingLeft: leftPad,
                  ['--lane-color' as string]: color,
                }}
                onPointerDown={(e) => onPointerDown(e, idx, false)}
                onDoubleClick={() => onDoubleClick(node.rev.changeId)}
                onContextMenu={(e) => onRowContextMenu(e, idx)}
              >
                <div className="rev-main">
                  <span className="rev-id mono" title={node.rev.changeId}>
                    <span className="id-prefix">{prefix}</span>
                    <span className="id-rest">{displayRest}</span>
                  </span>
                  {node.rev.isWorkingCopy && (
                    <button
                      type="button"
                      className="at-chip"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onPointerDown(e, idx, true);
                      }}
                      title={t('graph.dragAt')}
                    >
                      @
                    </button>
                  )}
                  {node.rev.conflict && (
                    <span className="conflict-mark" title={t('graph.conflictMark')} aria-label={t('graph.conflictMark')}>
                      !
                    </span>
                  )}
                  <span className="rev-desc">
                    {node.rev.description.trim() || t('graph.noDescription')}
                  </span>
                </div>
                {node.rev.bookmarks.length > 0 && (
                  <span className="bookmark-group">
                    {node.rev.bookmarks.map((b) => (
                      <span key={b} className="bookmark">
                        {b}
                      </span>
                    ))}
                  </span>
                )}
                {density === 'rich' && (
                  <span className="rev-meta muted">
                    {node.rev.author} · {formatTsRelativeThenAbsolute(locale, node.rev.committerTs)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
      <div className="graph-hint">
        {t('graph.hint')}
      </div>
    </div>
  );
}

/** jj log node symbols: `@` working copy, `◆` immutable, `○` other. */
type NodeGlyphKind = 'wc' | 'immutable' | 'commit';

function NodeGlyph({
  x,
  y,
  r,
  kind,
  color,
  selected,
}: {
  x: number;
  y: number;
  r: number;
  kind: NodeGlyphKind;
  color: string;
  selected: boolean;
}) {
  const stroke = selected ? 'var(--node-sel-stroke)' : 'transparent';
  const strokeWidth = selected ? 2 : 0;

  if (kind === 'wc') {
    return (
      <text
        className="node-glyph-wc"
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--node-wc)"
        stroke={selected ? 'var(--node-sel-stroke)' : 'none'}
        strokeWidth={selected ? 0.8 : 0}
        fontSize={Math.max(11, r * 2.4)}
        fontWeight={700}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        @
      </text>
    );
  }

  if (kind === 'immutable') {
    // Diamond (◆): square rotated 45°, sized to match circle footprint.
    const s = r * 1.2;
    const points = `${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`;
    return (
      <polygon
        points={points}
        fill={color}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    );
  }

  // Mutable commit (○): filled circle, lane-colored.
  return (
    <circle
      cx={x}
      cy={y}
      r={r}
      fill={color}
      stroke={stroke}
      strokeWidth={strokeWidth}
    />
  );
}
