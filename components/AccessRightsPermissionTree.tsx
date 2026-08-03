import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { getPermissionGroups, type PermissionPage } from "../data/navConfig";

interface AccessRightsPermissionTreeProps {
  selectedKeys: Set<string>;
  onChange: (keys: Set<string>) => void;
  readOnly?: boolean;
  includeSuperAdminOnly?: boolean;
}

export interface AccessRightsPermissionTreeHandle {
  expandAll: () => void;
  collapseAll: () => void;
  selectAll: () => void;
  clearAll: () => void;
}

export function AccessRightsTreeToolbar({
  readOnly,
  onExpandAll,
  onCollapseAll,
  onSelectAll,
  onClearAll,
}: {
  readOnly?: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  const actions = [
    ["Expand all", onExpandAll],
    ["Collapse all", onCollapseAll],
    ["Select all", onSelectAll],
    ["Clear all", onClearAll],
  ] as const;

  return (
    <div className="flex overflow-hidden rounded-md border border-border bg-surface text-[12px] shadow-sm">
      {actions.map(([label, fn], index) => (
        <button
          key={label}
          type="button"
          disabled={readOnly}
          onClick={fn}
          className={[
            "px-3 py-1.5 font-medium text-foreground transition-colors",
            "hover:bg-surface-alt active:bg-surface-alt/80",
            "disabled:cursor-not-allowed disabled:opacity-50",
            index > 0 ? "border-l border-border" : "",
          ].join(" ")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function pageLeafKeys(page: PermissionPage): string[] {
  if (page.children?.length) return page.children.map((c) => c.key);
  return [page.key];
}

function pageSelectionState(page: PermissionPage, keys: Set<string>): "all" | "some" | "none" {
  const leaves = pageLeafKeys(page);
  const selected = leaves.filter((k) => keys.has(k)).length;
  if (selected === 0) return "none";
  if (selected === leaves.length) return "all";
  return "some";
}

export const AccessRightsPermissionTree = forwardRef<
  AccessRightsPermissionTreeHandle,
  AccessRightsPermissionTreeProps
>(function AccessRightsPermissionTree(
  {
    selectedKeys,
    onChange,
    readOnly = false,
    includeSuperAdminOnly = false,
  },
  ref
) {
  const groups = useMemo(
    () => getPermissionGroups(includeSuperAdminOnly),
    [includeSuperAdminOnly]
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of groups) {
      for (const p of g.pages) init[p.key] = true;
    }
    return init;
  });

  const setKeys = (next: Set<string>) => {
    if (!readOnly) onChange(next);
  };

  const toggleKey = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setKeys(next);
  };

  const togglePage = (page: PermissionPage) => {
    const leaves = pageLeafKeys(page);
    const state = pageSelectionState(page, selectedKeys);
    const next = new Set(selectedKeys);
    if (state === "all") {
      for (const k of leaves) next.delete(k);
    } else {
      for (const k of leaves) next.add(k);
    }
    setKeys(next);
  };

  const toggleGroup = (pages: PermissionPage[]) => {
    const allLeaves = pages.flatMap(pageLeafKeys);
    const allSelected = allLeaves.every((k) => selectedKeys.has(k));
    const next = new Set(selectedKeys);
    if (allSelected) {
      for (const k of allLeaves) next.delete(k);
    } else {
      for (const k of allLeaves) next.add(k);
    }
    setKeys(next);
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of groups) for (const p of g.pages) next[p.key] = true;
    setExpanded(next);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const g of groups) for (const p of g.pages) next[p.key] = false;
    setExpanded(next);
  };

  const selectAll = () => {
    const all = groups.flatMap((g) => g.pages).flatMap(pageLeafKeys);
    setKeys(new Set(all));
  };

  const clearAll = () => setKeys(new Set());

  useImperativeHandle(ref, () => ({ expandAll, collapseAll, selectAll, clearAll }), [
    groups,
    readOnly,
    selectedKeys,
    onChange,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {groups.map((group) => {
          const groupLeaves = group.pages.flatMap(pageLeafKeys);
          const groupSelected = groupLeaves.filter((k) => selectedKeys.has(k)).length;
          const groupLabel = group.heading ?? "My Workspace";

          return (
            <section key={groupLabel} className="rounded-lg border border-border bg-surface">
              <div className="flex items-center justify-between gap-2 border-b border-border-soft px-3 py-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={groupSelected === groupLeaves.length && groupLeaves.length > 0}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate =
                          groupSelected > 0 && groupSelected < groupLeaves.length;
                      }
                    }}
                    onChange={() => toggleGroup(group.pages)}
                    className="rounded border-border"
                  />
                  <span className="text-[12px] font-semibold text-foreground">{groupLabel}</span>
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {groupSelected} of {groupLeaves.length}
                </span>
              </div>

              <ul className="divide-y divide-border-soft">
                {group.pages.map((page) => {
                  const state = pageSelectionState(page, selectedKeys);
                  const hasChildren = (page.children?.length ?? 0) > 0;
                  const isOpen = expanded[page.key] ?? true;

                  return (
                    <li key={page.key}>
                      <div className="flex items-center gap-2 px-3 py-2">
                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded((e) => ({ ...e, [page.key]: !isOpen }))
                            }
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        ) : (
                          <span className="w-3.5" />
                        )}
                        <input
                          type="checkbox"
                          disabled={readOnly}
                          checked={state === "all"}
                          ref={(el) => {
                            if (el) el.indeterminate = state === "some";
                          }}
                          onChange={() => togglePage(page)}
                          className="rounded border-border"
                        />
                        <span className="text-[12px] font-medium text-foreground">{page.label}</span>
                      </div>
                      {hasChildren && isOpen && (
                        <ul className="border-t border-border-soft bg-surface-alt/40 pb-1">
                          {page.children!.map((child) => (
                            <li
                              key={child.key}
                              className="flex items-center gap-2 py-1.5 pl-10 pr-3"
                            >
                              <input
                                type="checkbox"
                                disabled={readOnly}
                                checked={selectedKeys.has(child.key)}
                                onChange={() => toggleKey(child.key)}
                                className="rounded border-border"
                              />
                              <span className="text-[11px] text-foreground">{child.label}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
});
