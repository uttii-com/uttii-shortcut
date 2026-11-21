/* SPDX-FileCopyrightText: 2026 uttii-com <https://uttii.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
(function () {
    "use strict";
    console.log("[Shortcut App] Initializing advanced shortcut extension...");

    let lang = "ja";
    try {
        const loaded = window.OC?.InitialState?.loadState("shortcut", "lang");
        if (loaded === "en" || loaded === "ja") {
            lang = loaded;
        }
    } catch (e) {}

    const I18N = {
        ja: {
            defaultName: "ショートカット",
            lastPathLabel: (p) => "\n(元のリンク先: " + p + ")",
            notFoundConfirm: (name, lastPath) => "「" + name + "」のリンク先が見つかりませんでした。" + lastPath + "\n\nリンク先が削除または移動された可能性があります。\nこの無効なショートカットを削除しますか？",
            openFailed: "リンク先を開けませんでした",
            loadError: "ショートカットの読み込み中にエラーが発生しました。",
            deletedBroken: "無効なショートカットを削除しました",
            pickDestMulti: (n) => n + " 件のショートカットの作成先を選択",
            pickDestSingle: (name) => "ショートカットの作成先を選択: " + name,
            pickerUnavailable: "ファイル選択ダイアログを利用できませんでした。",
            createdMulti: (n, dest) => n + " 件のショートカットを作成しました (" + dest + ")",
            batchCreateFailed: "ショートカットの一括作成に失敗しました",
            createdSingle: (name, dest) => "「" + name + "」を作成しました (" + dest + ")",
            createFailed: "ショートカットの作成に失敗しました",
            commError: "通信エラーが発生しました",
            actionCreateSingle: "ショートカットを作成",
            actionCreateMulti: (n) => n + " 件のショートカットを作成",
            actionOpen: "リンク先を開く",
            actionLocate: "リンク先の場所を表示"
        },
        en: {
            defaultName: "Shortcut",
            lastPathLabel: (p) => "\n(Original target: " + p + ")",
            notFoundConfirm: (name, lastPath) => "The target for \"" + name + "\" could not be found." + lastPath + "\n\nThe target may have been deleted or moved.\nDo you want to delete this broken shortcut?",
            openFailed: "Could not open target",
            loadError: "An error occurred while loading the shortcut.",
            deletedBroken: "Removed broken shortcut",
            pickDestMulti: (n) => "Select destination for " + n + " shortcuts",
            pickDestSingle: (name) => "Select destination for shortcut: " + name,
            pickerUnavailable: "File picker dialog is unavailable.",
            createdMulti: (n, dest) => "Created " + n + " shortcuts in (" + dest + ")",
            batchCreateFailed: "Failed to create shortcuts in batch",
            createdSingle: (name, dest) => "Created \"" + name + "\" in (" + dest + ")",
            createFailed: "Failed to create shortcut",
            commError: "A communication error occurred",
            actionCreateSingle: "Create shortcut",
            actionCreateMulti: (n) => "Create " + n + " shortcuts",
            actionOpen: "Open target",
            actionLocate: "Show target location"
        }
    };

    const t = I18N[lang] || I18N.ja;

    async function loadRegisterFileAction() {
        const findInModule = (mod) => {
            if (!mod || typeof mod !== "object") return null;
            let registerFn = null;
            let defaultType = null;
            for (const val of Object.values(mod)) {
                if (typeof val === "function") {
                    const src = Function.prototype.toString.call(val);
                    if (
                        (src.includes("register:action") && src.includes("fileActions")) ||
                        src.includes("_nc_fileactions") ||
                        src.includes("Invalid file action")
                    ) {
                        registerFn = val;
                    }
                } else if (
                    val &&
                    typeof val === "object" &&
                    val.DEFAULT === "default" &&
                    val.HIDDEN === "hidden"
                ) {
                    defaultType = val;
                }
            }
            if (registerFn) {
                return {
                    registerFileAction: registerFn,
                    defaultType: defaultType || { DEFAULT: "default", HIDDEN: "hidden" }
                };
            }
            return null;
        };

        const scanLoadedChunks = async () => {
            const resources = performance.getEntriesByType("resource");
            const candidates = [...new Set(
                resources
                    .map((r) => r.name)
                    .filter((name) => name.includes("/dist/") && name.endsWith(".chunk.mjs"))
            )];
            for (const url of candidates) {
                try {
                    const mod = await import(url);
                    const found = findInModule(mod);
                    if (found) return found;
                } catch (ignored) {}
            }
            return null;
        };

        const registerViaScope = () => {
            const root = window._nc_files_scope;
            if (!root || typeof root !== "object") return null;
            const scope =
                root.v4_0 ||
                Object.values(root).find(
                    (s) => s && typeof s === "object" && (s.registry || s.fileActions)
                );
            if (!scope) return null;
            return {
                registerFileAction: (action) => {
                    if (!action || typeof action.id !== "string" || !action.id) {
                        throw new Error("Invalid id");
                    }
                    if (!(scope.fileActions instanceof Map)) {
                        scope.fileActions = new Map();
                    }
                    if (scope.fileActions.has(action.id)) return;
                    scope.fileActions.set(action.id, action);
                    if (scope.registry && typeof scope.registry.dispatchEvent === "function") {
                        scope.registry.dispatchEvent(
                            new CustomEvent("register:action", { detail: action })
                        );
                    }
                },
                defaultType: { DEFAULT: "default", HIDDEN: "hidden" }
            };
        };

        for (let attempt = 0; attempt < 20; attempt++) {
            const found = await scanLoadedChunks();
            if (found) return found;
            const fallback = registerViaScope();
            if (fallback) return fallback;
            await new Promise((r) => setTimeout(r, 100));
        }
        return null;
    }

    async function navigateToShortcutTarget(fileId, openParentOnly = false) {
        try {
            const url = OC.generateUrl("/apps/shortcut/api/resolve-file") + "?fileId=" + encodeURIComponent(fileId);
            const res = await fetch(url, {
                headers: { "requesttoken": OC.requestToken }
            });
            const data = await res.json();
            if (!res.ok || !data.success || !data.target) {
                const targetNotFound = data.targetNotFound === true;
                const shortcutFileName = data.shortcutFileName || t.defaultName;
                const lastPath = data.lastKnownPath ? t.lastPathLabel(data.lastKnownPath) : "";
                if (targetNotFound) {
                    const confirmMsg = t.notFoundConfirm(shortcutFileName, lastPath);
                    const doDelete = confirm(confirmMsg);
                    if (doDelete) {
                        await deleteDeadShortcut(fileId);
                    }
                } else {
                    const msg = data.error || t.openFailed;
                    alert(msg);
                }
                return;
            }
            const target = data.target;
            console.log("[Shortcut App] Resolved shortcut to:", target);
            if (openParentOnly || target.type === "file") {
                const targetDir = target.parentDir || "/";
                if (window.OCP?.Files?.Router?.goToRoute) {
                    window.OCP.Files.Router.goToRoute(
                        null,
                        { view: "files", fileid: String(target.id) },
                        { dir: targetDir, openfile: "true" }
                    );
                } else if (window.OCA?.Files?.App?.fileList?.changeDirectory) {
                    window.OCA.Files.App.fileList.changeDirectory(targetDir);
                } else {
                    window.location.hash = "/files?dir=" + encodeURIComponent(targetDir);
                }
            } else {
                if (window.OCP?.Files?.Router?.goToRoute) {
                    window.OCP.Files.Router.goToRoute(null, { view: "files" }, { dir: target.path });
                } else if (window.OCA?.Files?.App?.fileList?.changeDirectory) {
                    window.OCA.Files.App.fileList.changeDirectory(target.path);
                } else {
                    window.location.hash = "/files?dir=" + encodeURIComponent(target.path);
                }
            }
        } catch (err) {
            console.error("[Shortcut App] Failed to resolve shortcut:", err);
            alert(t.loadError);
        }
    }

    async function deleteDeadShortcut(fileId) {
        try {
            const res = await fetch(OC.generateUrl("/apps/shortcut/api/delete"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "requesttoken": OC.requestToken,
                },
                body: JSON.stringify({ fileId: fileId }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                if (OC.Notification?.showTemporary) {
                    OC.Notification.showTemporary(t.deletedBroken);
                }
                if (window.OCA?.Files?.App?.fileList?.reload) {
                    window.OCA.Files.App.fileList.reload();
                }
            }
        } catch (e) {
            console.error("[Shortcut App] Failed to delete shortcut:", e);
        }
    }

    function showCreateShortcutDialog(nodes, currentDir) {
        if (!nodes || nodes.length === 0) return;
        const isMultiple = nodes.length > 1;
        const dialogTitle = isMultiple
            ? t.pickDestMulti(nodes.length)
            : t.pickDestSingle(nodes[0].basename || nodes[0].name || "item");
        if (typeof OC.dialogs?.filepicker !== "function") {
            alert(t.pickerUnavailable);
            return;
        }
        OC.dialogs.filepicker(
            dialogTitle,
            async function (destFolderPath) {
                if (!destFolderPath) return;
                try {
                    if (isMultiple) {
                        const items = nodes.map(n => ({
                            targetId: n.fileid || n.id,
                            targetPath: n.path || ((currentDir ? currentDir.replace(/\/$/, "") : "") + "/" + (n.basename || n.name)),
                            shortcutName: n.basename || n.name || "item",
                            targetType: (n.type === "folder" || n.type === 1 || n.mimetype === "httpd/unix-directory") ? "dir" : "file",
                        }));
                        const res = await fetch(OC.generateUrl("/apps/shortcut/api/create-batch"), {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "requesttoken": OC.requestToken,
                            },
                            body: JSON.stringify({
                                items: items,
                                destFolderPath: destFolderPath,
                            }),
                        });
                        const data = await res.json();
                        if (res.ok && data.success) {
                            const msg = t.createdMulti(data.count, destFolderPath);
                            if (OC.Notification?.showTemporary) {
                                OC.Notification.showTemporary(msg);
                            }
                        } else {
                            alert(data.error || t.batchCreateFailed);
                        }
                    } else {
                        const node = nodes[0];
                        const isFolder = (node.type === "folder" || node.type === 1 || node.mimetype === "httpd/unix-directory");
                        const nodeName = node.basename || node.name || "item";
                        const fileId = node.fileid || node.id;
                        const nodePath = node.path || ((currentDir ? currentDir.replace(/\/$/, "") : "") + "/" + nodeName);
                        const res = await fetch(OC.generateUrl("/apps/shortcut/api/create"), {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "requesttoken": OC.requestToken,
                            },
                            body: JSON.stringify({
                                targetId: fileId,
                                targetPath: nodePath,
                                destFolderPath: destFolderPath,
                                shortcutName: nodeName,
                                targetType: isFolder ? "dir" : "file",
                            }),
                        });
                        const data = await res.json();
                        if (res.ok && data.success) {
                            const msg = t.createdSingle(data.file.name, destFolderPath);
                            if (OC.Notification?.showTemporary) {
                                OC.Notification.showTemporary(msg);
                            }
                        } else {
                            alert(data.error || t.createFailed);
                        }
                    }
                } catch (e) {
                    console.error("[Shortcut App] Create request failed:", e);
                    alert(t.commError);
                }
            },
            false,
            null,
            true,
            OC.dialogs.FILEPICKER_TYPE_CHOOSE,
            currentDir || "/",
            { allowDirectoryChooser: true }
        );
    }

    async function init() {
        const icons = {
            create: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>',
            open: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7zM5 5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4h-2v4H5V7h4V5H5z"/></svg>',
            locate: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>'
        };
        const api = await loadRegisterFileAction();
        if (api && typeof api.registerFileAction === "function") {
            console.log("[Shortcut App] Registering modern File Actions (lang=" + lang + ")...");
            api.registerFileAction({
                id: "shortcut-create",
                displayName: ({ nodes }) => (nodes && nodes.length > 1) ? t.actionCreateMulti(nodes.length) : t.actionCreateSingle,
                iconSvgInline: () => icons.create,
                order: 30,
                enabled({ nodes, view }) {
                    if (view?.id === "trashbin") return false;
                    return nodes && nodes.length >= 1;
                },
                async exec({ nodes, folder }) {
                    if (!nodes || nodes.length === 0) return false;
                    showCreateShortcutDialog(nodes, folder?.path || "/");
                    return true;
                }
            });
            api.registerFileAction({
                id: "shortcut-open",
                displayName: () => t.actionOpen,
                iconSvgInline: () => icons.open,
                order: -100,
                default: api.defaultType?.DEFAULT || "default",
                enabled({ nodes }) {
                    if (!nodes || nodes.length !== 1) return false;
                    const name = (nodes[0].basename || nodes[0].name || "").toLowerCase();
                    return name.endsWith(".url") || name.endsWith(".shortcut");
                },
                async exec({ nodes }) {
                    if (!nodes || nodes.length !== 1) return false;
                    const fileId = nodes[0].fileid || nodes[0].id;
                    await navigateToShortcutTarget(fileId, false);
                    return true;
                }
            });
            api.registerFileAction({
                id: "shortcut-locate",
                displayName: () => t.actionLocate,
                iconSvgInline: () => icons.locate,
                order: -90,
                enabled({ nodes }) {
                    if (!nodes || nodes.length !== 1) return false;
                    const name = (nodes[0].basename || nodes[0].name || "").toLowerCase();
                    return name.endsWith(".url") || name.endsWith(".shortcut");
                },
                async exec({ nodes }) {
                    if (!nodes || nodes.length !== 1) return false;
                    const fileId = nodes[0].fileid || nodes[0].id;
                    await navigateToShortcutTarget(fileId, true);
                    return true;
                }
            });
        }
        document.addEventListener("click", function (e) {
            const entry = e.target.closest("[data-file], .files-list__entry");
            if (!entry) return;
            const fileName = entry.getAttribute("data-file") || entry.querySelector(".innernametext, .filename")?.textContent?.trim();
            if (fileName && (fileName.toLowerCase().endsWith(".url") || fileName.toLowerCase().endsWith(".shortcut"))) {
                const fileId = entry.getAttribute("data-id") || entry.getAttribute("data-fileid");
                if (fileId) {
                    if (!e.target.closest(".action-menu, .popovermenu, button.action")) {
                        e.preventDefault();
                        e.stopPropagation();
                        navigateToShortcutTarget(parseInt(fileId, 10), false);
                    }
                }
            }
        }, true);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
