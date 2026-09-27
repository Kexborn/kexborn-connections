const BaseActorSheet = foundry.appv1.sheets.ActorSheet;

export class BoardSheet extends BaseActorSheet {
    constructor(...args) {
        super(...args);
        this.boardState = {
            tool: 'move',
            color: '#ffffff',
            style: 'solid',
            groupShape: 'circle',
            panX: 0,
            panY: 0,
            zoom: 1,
            selectedNodes: []
        };
        this.undoStack = [];
        this.redoStack = [];
    }

    static get defaultOptions() { 
        return foundry.utils.mergeObject(super.defaultOptions, { 
            classes: ["sheet", "actor", "kbm-board-sheet"], 
            template: "modules/kexborn-connections/templates/board-sheet.html", 
            width: 1000, 
            height: 800, 
            resizable: true,
            dragDrop: [{ dragSelector: null, dropSelector: ".board-viewport" }]
        }); 
    }

    _saveUndoState() {
        this.undoStack.push({
            nodes: foundry.utils.deepClone(this.actor.system.nodes || []),
            connections: foundry.utils.deepClone(this.actor.system.connections || [])
        });
        if (this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack = [];
    }

    async getData() { 
        const context = await super.getData(); 
        context.system = this.actor.system; 
        context.isEditable = this.isEditable;
        
        context.theme = game.settings.get("kexborn-connections", "theme") || "dnd-dark";
        context.isLocked = this.actor.getFlag("kexborn-connections", "sheetLocked") ?? true;

        context.boardNodes = (this.actor.system.nodes || []).map(n => {
            const isGroup = n.type === "group";
            const isJointV = n.type === "joint-v";
            const isJointH = n.type === "joint-h";
            const isJointLegacy = n.type === "joint";
            const isJoint = isJointV || isJointH || isJointLegacy;
            const isRecord = n.type === "record";

            return {
                ...n,
                isGroup: isGroup, 
                isJointV: isJointV,
                isJointH: isJointH,
                isJointLegacy: isJointLegacy,
                isJoint: isJoint,
                isRecord: isRecord,
                isActorLike: !isGroup && !isJoint, 
                bgColor: isGroup ? n.color + "22" : null,
                halfW: n.width / 2, 
                halfH: n.height / 2,
                isCircle: n.shape === 'circle', 
                isSquare: n.shape === 'square',
                isRect: n.shape === 'rect', 
                isTriangle: n.shape === 'triangle',
                isResizableXY: n.shape === 'rect' || n.shape === 'triangle',
                radius: isGroup ? (n.width / 2) + 2 : (isJoint ? 8 : 35),
                isDead: n.status === "dead", 
                isUnknown: n.status === "unknown", 
                isCrossed: n.status === "crossed",
                isCheck: n.status === "check", 
                isDefaultColor: !n.color || n.color === "default" || n.color === ""
            };
        });

        const getIntersectionRadius = (node, angle) => {
            if (node.isJoint) return 8;
            if (!node.isGroup) return 35; 
            let hw = (node.width || 100) / 2; 
            let hh = (node.height || 50) / 2;
            if (node.shape === 'circle') return Math.min(hw, hh);
            let absCos = Math.abs(Math.cos(angle)); 
            let absSin = Math.abs(Math.sin(angle));
            return Math.min(absCos > 0 ? hw / absCos : Infinity, absSin > 0 ? hh / absSin : Infinity);
        };

        context.connections = [];
        for (let c of (this.actor.system.connections || [])) {
            let source = context.boardNodes.find(n => n.id === c.sourceId);
            let target = context.boardNodes.find(n => n.id === c.targetId);
            if (source && target) {
                let dx = target.x - source.x; 
                let dy = target.y - source.y;
                let dist = Math.sqrt(dx*dx + dy*dy); 
                let angle = Math.atan2(dy, dx);
                
                let sAngle = angle;
                let tAngle = angle;

                let forceVertical = source.isJointV || target.isJointV;
                let forceHorizontal = source.isJointH || target.isJointH;

                if (forceVertical) {
                    sAngle = dy >= 0 ? Math.PI / 2 : -Math.PI / 2;
                    tAngle = dy >= 0 ? Math.PI / 2 : -Math.PI / 2;
                } else if (forceHorizontal) {
                    sAngle = dx >= 0 ? 0 : Math.PI;
                    tAngle = dx >= 0 ? 0 : Math.PI;
                } else {
                    if (source.isJointLegacy || c.style === "orthogonal") sAngle = Math.round(sAngle / (Math.PI / 2)) * (Math.PI / 2);
                    if (target.isJointLegacy || c.style === "orthogonal") tAngle = Math.round(tAngle / (Math.PI / 2)) * (Math.PI / 2);
                }

                let sRad = getIntersectionRadius(source, sAngle);
                let tRad = getIntersectionRadius(target, tAngle);
                
                if (dist <= sRad + tRad) {
                    dist = sRad + tRad + 1;
                }

                let x1 = source.x + Math.cos(sAngle) * sRad; 
                let y1 = source.y + Math.sin(sAngle) * sRad;
                let x2 = target.x - Math.cos(tAngle) * tRad; 
                let y2 = target.y - Math.sin(tAngle) * tRad;
                
                let svgPath = "";
                if (c.style === "wavy") {
                    let wLen = 15; 
                    let amp = 8;
                    let lineDist = Math.sqrt(Math.pow(x2-x1, 2) + Math.pow(y2-y1, 2));
                    let steps = Math.max(1, Math.floor(lineDist / wLen));
                    svgPath = `M ${x1} ${y1} `;
                    for(let i = 1; i <= steps; i++) {
                        let pX = x1 + ((x2-x1) * (i/steps)); 
                        let pY = y1 + ((y2-y1) * (i/steps));
                        let perpX = -Math.sin(sAngle) * (i % 2 === 0 ? amp : -amp); 
                        let perpY = Math.cos(sAngle) * (i % 2 === 0 ? amp : -amp);
                        svgPath += `L ${pX + perpX} ${pY + perpY} `;
                    }
                    svgPath += `L ${x2} ${y2}`;
                } else if (c.style === "orthogonal") {
                    if (!source.isJoint && !target.isJoint) {
                        let midY = (y1 + y2) / 2;
                        svgPath = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
                    } else {
                        let sMinDist = source.isJoint ? 15 : 0;
                        let tMinDist = target.isJoint ? 15 : 0;
                        let trunkDrop = 30;

                        let cx1 = x1 + Math.cos(sAngle) * sMinDist;
                        let cy1 = y1 + Math.sin(sAngle) * sMinDist;
                        let cx2 = x2 - Math.cos(tAngle) * tMinDist;
                        let cy2 = y2 - Math.sin(tAngle) * tMinDist;

                        if (forceVertical) {
                            let jointNode = source.isJointV ? source : target;
                            let sDir = source.isJointV ? Math.sin(sAngle) : -Math.sin(tAngle);
                            let fixedMidY = jointNode.y + (sDir > 0 ? trunkDrop : -trunkDrop);
                            svgPath = `M ${x1} ${y1} L ${cx1} ${cy1} L ${cx1} ${fixedMidY} L ${cx2} ${fixedMidY} L ${cx2} ${cy2} L ${x2} ${y2}`;
                        } 
                        else if (forceHorizontal) {
                            let jointNode = source.isJointH ? source : target;
                            let sDir = source.isJointH ? Math.cos(sAngle) : -Math.cos(tAngle);
                            let fixedMidX = jointNode.x + (sDir > 0 ? trunkDrop : -trunkDrop);
                            svgPath = `M ${x1} ${y1} L ${cx1} ${cy1} L ${fixedMidX} ${cy1} L ${fixedMidX} ${cy2} L ${cx2} ${cy2} L ${x2} ${y2}`;
                        } 
                        else {
                            let midX = (cx1 + cx2) / 2;
                            let midY = (cy1 + cy2) / 2;
                            let sIsH = Math.abs(Math.cos(sAngle)) > 0.5;
                            let tIsH = Math.abs(Math.cos(tAngle)) > 0.5;

                            if (sIsH || tIsH) {
                                svgPath = `M ${x1} ${y1} L ${cx1} ${cy1} L ${midX} ${cy1} L ${midX} ${cy2} L ${cx2} ${cy2} L ${x2} ${y2}`;
                            } else {
                                svgPath = `M ${x1} ${y1} L ${cx1} ${cy1} L ${cx1} ${midY} L ${cx2} ${midY} L ${cx2} ${cy2} L ${x2} ${y2}`;
                            }
                        }
                    }
                }

                context.connections.push({
                    ...c, 
                    x1, y1, x2, y2, 
                    midX: (x1 + x2) / 2, 
                    midY: (y1 + y2) / 2,
                    svgPath: svgPath, 
                    isSolid: c.style === "solid", 
                    isDashed: c.style === "dashed", 
                    isDouble: c.style === "double",
                    isChain: c.style === "chain", 
                    isWavy: c.style === "wavy", 
                    isOrthogonal: c.style === "orthogonal",
                    hasPath: c.style === "wavy" || c.style === "orthogonal"
                });
            }
        }
        return context; 
    }

    _openRecordDialog(nodeId, theme, isLocked) {
        const nodes = foundry.utils.deepClone(this.actor.system.nodes);
        const n = nodes.find(x => x.id === nodeId);
        if (!n) return;
        
        const dialogClasses = ["dialog", "kbm-window", `theme-${theme}`, "kbm-note-dialog"];
        const styleBlock = `<style>.kbm-note-dialog .window-content { background: var(--kbm-bg-color) !important; color: var(--kbm-text) !important; border: 1px solid var(--kbm-border) !important; border-radius: 5px; } .kbm-note-dialog .dialog-buttons { margin-top: 15px; } .kbm-note-dialog .dialog-button { background: rgba(0,0,0,0.2) !important; border: 1px solid var(--kbm-border) !important; color: var(--kbm-text) !important; cursor: pointer; transition: 0.2s; font-family: var(--kbm-font-header); font-size: 16px; padding: 5px; border-radius: 4px; } .kbm-note-dialog .dialog-button:hover { background: var(--kbm-border) !important; color: var(--kbm-bg-color) !important; }</style>`;

        if (isLocked) {
            new Dialog({
                title: n.name,
                content: styleBlock + `<div style="padding: 15px; font-size: 15px; white-space: pre-wrap; font-family: var(--kbm-font-body); color: var(--kbm-text); min-height: 150px; background: rgba(0,0,0,0.1); border: 1px dashed var(--kbm-border-subtle); border-radius: 4px; margin-top: 5px;">${n.uuid || game.i18n.localize("KEXBORN.NoRecords")}</div>`,
                buttons: { close: { label: game.i18n.localize("KEXBORN.Close") } },
                default: "close"
            }, { width: 500, classes: dialogClasses }).render(true);
        } else {
            new Dialog({
                title: game.i18n.localize("KEXBORN.ToolRecord") || "Запись",
                content: styleBlock + `
                    <div style="margin-bottom: 10px; font-family: var(--kbm-font-body);">
                        <input type="text" id="record-name" value="${n.name}" placeholder="Заголовок" style="width: 100%; padding: 5px; background: var(--kbm-input-bg); color: var(--kbm-input-text); border: 1px solid var(--kbm-border); border-radius: 4px;"/>
                    </div>
                    <div style="padding: 10px 0; height: 100%;">
                        <textarea id="record-text" style="width: 100%; height: 250px; font-family: var(--kbm-font-body); font-size: 14px; padding: 10px; background: var(--kbm-input-bg); color: var(--kbm-input-text); border: 1px solid var(--kbm-border); border-radius: 4px; resize: none;">${n.uuid || ""}</textarea>
                    </div>
                `,
                buttons: {
                    save: {
                        label: game.i18n.localize("KEXBORN.Save"),
                        callback: async (dHtml) => {
                            n.name = dHtml.find('#record-name').val() || n.name;
                            n.uuid = dHtml.find('#record-text').val();
                            this._saveUndoState();
                            await this.actor.update({"system.nodes": nodes});
                        }
                    }
                },
                default: "save"
            }, { width: 500, classes: dialogClasses }).render(true);
        }
    }

    activateListeners(html) {
        super.activateListeners(html);
        const isLocked = this.actor.getFlag("kexborn-connections", "sheetLocked") ?? true;
        const theme = game.settings.get("kexborn-connections", "theme") || "dnd-dark";

        const viewport = html.find('.board-viewport');
        const canvas = html.find('.board-canvas');
        const bg = html.find('.board-bg');

        // КЛИК ПО НАЗВАНИЮ ЗАПИСИ (Доступно наблюдателям для чтения)
        html.find('.record-name').click(async ev => {
            ev.stopPropagation();
            const nodeId = $(ev.currentTarget).closest('.board-node').data("node-id");
            this._openRecordDialog(nodeId, theme, isLocked || !this.isEditable);
        });

        // ГОРЯЧИЕ КЛАВИШИ (Delete, Ctrl+Z, Ctrl+Shift+Z)
        html.on("keydown", async (ev) => {
            if (ev.key === "Delete" || ev.key === "Del") {
                if (!this.isEditable || isLocked) return;
                if (this.boardState.selectedNodes.length > 0) {
                    const newNodes = this.actor.system.nodes.filter(n => !this.boardState.selectedNodes.includes(n.id));
                    const newConns = (this.actor.system.connections || []).filter(c => !this.boardState.selectedNodes.includes(c.sourceId) && !this.boardState.selectedNodes.includes(c.targetId));
                    this._saveUndoState();
                    this.boardState.selectedNodes = [];
                    html.find('.board-node').removeClass('selected-node');
                    await this.actor.update({ "system.nodes": newNodes, "system.connections": newConns });
                }
            }
            if (ev.ctrlKey && ev.key.toLowerCase() === "z") {
                if (!this.isEditable || isLocked) return;
                ev.preventDefault();
                if (ev.shiftKey) {
                    if (this.redoStack && this.redoStack.length > 0) {
                        const nextState = this.redoStack.pop();
                        this.undoStack.push({
                            nodes: foundry.utils.deepClone(this.actor.system.nodes || []),
                            connections: foundry.utils.deepClone(this.actor.system.connections || [])
                        });
                        await this.actor.update({ "system.nodes": nextState.nodes, "system.connections": nextState.connections });
                    }
                } else {
                    if (this.undoStack && this.undoStack.length > 0) {
                        const prevState = this.undoStack.pop();
                        this.redoStack.push({
                            nodes: foundry.utils.deepClone(this.actor.system.nodes || []),
                            connections: foundry.utils.deepClone(this.actor.system.connections || [])
                        });
                        await this.actor.update({ "system.nodes": prevState.nodes, "system.connections": prevState.connections });
                    }
                }
            }
        });

        // КОНТЕКСТНОЕ МЕНЮ (ПКМ) - Доступно Наблюдателям
        html.find('.node-portrait, .group-hitbox, .group-name').on('mousedown', ev => {
            if (ev.button === 2) {
                ev.stopPropagation(); 
                const nodeEl = $(ev.currentTarget).closest('.board-node');
                const nodeId = nodeEl.data("node-id");
                const nodeType = nodeEl.attr("data-type");
                
                const colorPicker = html.find('#node-color-picker');
                colorPicker.data('active-node', nodeId);
                
                const rect = viewport[0].getBoundingClientRect();
                const px = ev.clientX - rect.left;
                const py = ev.clientY - rect.top;
                
                if (isLocked || !this.isEditable) {
                    colorPicker.find('.picker-dot').css({'opacity': '0.3', 'pointer-events': 'none'});
                } else {
                    colorPicker.find('.picker-dot').css({'opacity': '1', 'pointer-events': 'auto'});
                }

                if (nodeType === "journal" || nodeType === "record") {
                    colorPicker.find('#show-image-btn').hide();
                } else {
                    colorPicker.find('#show-image-btn').show().css('display', 'flex');
                }

                colorPicker.css({ left: px + 'px', top: py + 'px', display: 'flex' });
            }
        });

        viewport.on('contextmenu', ev => ev.preventDefault());

        const updateTransform = () => {
            canvas.css('transform', `translate(${this.boardState.panX}px, ${this.boardState.panY}px) scale(${this.boardState.zoom})`);
            bg.css('background-position', `${this.boardState.panX}px ${this.boardState.panY}px`);
            bg.css('background-size', `${30 * this.boardState.zoom}px ${30 * this.boardState.zoom}px`);
        };
        
        updateTransform();

        viewport.on('wheel', ev => {
            ev.preventDefault();
            const delta = ev.originalEvent.deltaY > 0 ? -0.1 : 0.1;
            const oldZoom = this.boardState.zoom;
            const newZoom = Math.max(0.2, Math.min(3, oldZoom + delta));
            const rect = viewport[0].getBoundingClientRect();
            const mouseX = ev.clientX - rect.left; 
            const mouseY = ev.clientY - rect.top;
            this.boardState.panX = mouseX - (mouseX - this.boardState.panX) * (newZoom / oldZoom);
            this.boardState.panY = mouseY - (mouseY - this.boardState.panY) * (newZoom / oldZoom);
            this.boardState.zoom = newZoom; 
            updateTransform();
            
            html.find('#node-color-picker').hide();
        });

        const getCanvasCoords = (e) => {
            const rect = viewport[0].getBoundingClientRect();
            return { 
                x: (e.clientX - rect.left - this.boardState.panX) / this.boardState.zoom, 
                y: (e.clientY - rect.top - this.boardState.panY) / this.boardState.zoom 
            };
        };

        // ОТКРЫТИЕ ПОРТРЕТА - Работает для Наблюдателей без проверки fromUuid
        html.find('#show-image-btn').click(async ev => {
            ev.stopPropagation();
            const activeNode = html.find('#node-color-picker').data('active-node');
            if (!activeNode) return;
            const nodeData = this.actor.system.nodes.find(n => n.id === activeNode);
            if (nodeData && nodeData.img) {
                new ImagePopout(nodeData.img, { title: nodeData.name, uuid: nodeData.uuid || "" }).render(true);
            }
            html.find('#node-color-picker').hide();
        });

        // ОТКРЫТИЕ ЛИСТА - Работает для Наблюдателей
        html.find('#show-sheet-btn').click(async ev => {
            ev.stopPropagation();
            const activeNode = html.find('#node-color-picker').data('active-node');
            if (!activeNode) return;
            const nodeData = this.actor.system.nodes.find(n => n.id === activeNode);
            
            if (nodeData && nodeData.type === "record") {
                this._openRecordDialog(nodeData.id, theme, isLocked || !this.isEditable);
            } else if (nodeData && nodeData.uuid) {
                const doc = await fromUuid(nodeData.uuid);
                if (doc) {
                    doc.sheet.render(true);
                } else {
                    ui.notifications.warn("Нет доступа к листу персонажа или документ удален.");
                }
            }
            html.find('#node-color-picker').hide();
        });

        html.find('.picker-dot').click(async ev => {
            ev.stopPropagation();
            const activeNode = html.find('#node-color-picker').data('active-node');
            if (!activeNode) return;
            const chosenColor = $(ev.currentTarget).data('color');
            const nodes = foundry.utils.deepClone(this.actor.system.nodes);
            const n = nodes.find(x => x.id === activeNode);
            if (n) {
                n.color = chosenColor;
                this._saveUndoState();
                await this.actor.update({"system.nodes": nodes});
            }
            html.find('#node-color-picker').hide();
        });

        viewport.on('mousedown', ev => {
            html.focus();
            const colorPicker = html.find('#node-color-picker');
            if (colorPicker.is(':visible') && !$(ev.target).closest('#node-color-picker').length) {
                colorPicker.hide();
            }

            if (ev.button === 1 || ev.button === 2) {
                if (ev.button === 2 && $(ev.target).closest('.node-portrait').length) return;

                ev.preventDefault();
                let startX = ev.clientX - this.boardState.panX; 
                let startY = ev.clientY - this.boardState.panY;
                const onMove = e => { 
                    this.boardState.panX = e.clientX - startX; 
                    this.boardState.panY = e.clientY - startY; 
                    updateTransform(); 
                };
                const onUp = () => { 
                    $(document).off('mousemove', onMove); 
                    $(document).off('mouseup', onUp); 
                };
                $(document).on('mousemove', onMove); 
                $(document).on('mouseup', onUp);
            }
        });

        html.find('.sheet-lock').click(async ev => { 
            ev.preventDefault(); 
            await this.actor.setFlag("kexborn-connections", "sheetLocked", !isLocked); 
        });
        
        viewport.addClass('tool-' + this.boardState.tool);

        this.boardState.selectedNodes.forEach(id => { 
            html.find(`.board-node[data-node-id="${id}"]`).addClass('selected-node'); 
        });

        // -----------------------------------------------------
        // ВСЕ ЧТО НИЖЕ — БЛОКИРУЕТСЯ ДЛЯ НАБЛЮДАТЕЛЕЙ И БЕЗ ПРАВ
        if (!this.isEditable) return;
        // -----------------------------------------------------

        html.find('.tool-btn').removeClass('active'); 
        html.find(`.tool-btn[data-tool="${this.boardState.tool}"]`).addClass('active');
        html.find('.color-dot').removeClass('active'); 
        html.find(`.color-dot[data-color="${this.boardState.color}"]`).addClass('active');
        html.find('#thread-style').val(this.boardState.style); 
        html.find('#group-shape').val(this.boardState.groupShape);

        html.find('.tool-btn').click(ev => {
            html.find('.tool-btn').removeClass('active'); 
            $(ev.currentTarget).addClass('active');
            this.boardState.tool = $(ev.currentTarget).data('tool');
            viewport.removeClass('tool-move tool-draw tool-joint-v tool-joint-h tool-group tool-cut tool-note tool-record').addClass('tool-' + this.boardState.tool);
        });
        
        html.find('.color-dot').click(ev => { 
            html.find('.color-dot').removeClass('active'); 
            $(ev.currentTarget).addClass('active'); 
            this.boardState.color = $(ev.currentTarget).data('color'); 
        });
        
        html.find('#thread-style').change(ev => { this.boardState.style = ev.target.value; });
        html.find('#group-shape').change(ev => { this.boardState.groupShape = ev.target.value; });

        const getIntersectionLive = (sType, shape, w, h, angle) => {
            if (sType.startsWith('joint')) return 8;
            if (sType === 'actor' || sType === 'item' || sType === 'journal' || sType === 'record') return 35;
            
            let hw = (w || 100) / 2; 
            let hh = (h || 50) / 2;
            if (shape === 'circle') return Math.min(hw, hh);
            let absCos = Math.abs(Math.cos(angle)); 
            let absSin = Math.abs(Math.sin(angle));
            return Math.min(absCos > 0 ? hw / absCos : Infinity, absSin > 0 ? hh / absSin : Infinity);
        };

        const updateLinesLive = (nodeId, curX, curY, curW, curH, curType, curShape) => {
            viewport.find('.connection-group').each((i, el) => {
                const g = $(el); 
                const sId = g.data("source"); 
                const tId = g.data("target");
                if (sId === nodeId || tId === nodeId) {
                    const sNode = viewport.find(`.board-node[data-node-id="${sId}"]`);
                    const tNode = viewport.find(`.board-node[data-node-id="${tId}"]`);
                    if (!sNode.length || !tNode.length) return;

                    const sx = sId === nodeId ? curX : parseFloat(sNode.attr('data-x'));
                    const sy = sId === nodeId ? curY : parseFloat(sNode.attr('data-y'));
                    const tx = tId === nodeId ? curX : parseFloat(tNode.attr('data-x'));
                    const ty = tId === nodeId ? curY : parseFloat(tNode.attr('data-y'));

                    const dx = tx - sx; 
                    const dy = ty - sy; 
                    const angle = Math.atan2(dy, dx);
                    
                    const sType = sId === nodeId ? curType : sNode.attr('data-type');
                    const tType = tId === nodeId ? curType : tNode.attr('data-type');

                    let sAngle = angle;
                    let tAngle = angle;
                    
                    let forceVertical = sType === 'joint-v' || tType === 'joint-v';
                    let forceHorizontal = sType === 'joint-h' || tType === 'joint-h';

                    if (forceVertical) {
                        sAngle = dy >= 0 ? Math.PI / 2 : -Math.PI / 2;
                        tAngle = dy >= 0 ? Math.PI / 2 : -Math.PI / 2;
                    } else if (forceHorizontal) {
                        sAngle = dx >= 0 ? 0 : Math.PI;
                        tAngle = dx >= 0 ? 0 : Math.PI;
                    } else {
                        if (sType === 'joint') sAngle = Math.round(sAngle / (Math.PI / 2)) * (Math.PI / 2);
                        if (tType === 'joint') tAngle = Math.round(tAngle / (Math.PI / 2)) * (Math.PI / 2);
                    }

                    const sr = sId === nodeId ? getIntersectionLive(curType, curShape, curW, curH, sAngle) : getIntersectionLive(sType, sNode.attr('data-shape') || 'circle', parseFloat(sNode.attr('data-w')||70), parseFloat(sNode.attr('data-h')||70), sAngle);
                    const tr = tId === nodeId ? getIntersectionLive(curType, curShape, curW, curH, tAngle) : getIntersectionLive(tType, tNode.attr('data-shape') || 'circle', parseFloat(tNode.attr('data-w')||70), parseFloat(tNode.attr('data-h')||70), tAngle);

                    const x1 = sx + Math.cos(sAngle) * sr; 
                    const y1 = sy + Math.sin(sAngle) * sr;
                    const x2 = tx - Math.cos(tAngle) * tr; 
                    const y2 = ty - Math.sin(tAngle) * tr;
                    
                    let trunkDrop = 30;

                    if (g.find('path.connection-hitbox').length) {
                        let isOrthogonal = false;
                        const conns = this.actor.system.connections;
                        const cData = conns.find(c => c.id === g.data('conn-id'));
                        if (cData && cData.style === 'orthogonal') isOrthogonal = true;

                        if (isOrthogonal) {
                            let sMinDist = sType.startsWith('joint') ? 15 : 0;
                            let tMinDist = tType.startsWith('joint') ? 15 : 0;

                            let cx1 = x1 + Math.cos(sAngle) * sMinDist;
                            let cy1 = y1 + Math.sin(sAngle) * sMinDist;
                            let cx2 = x2 - Math.cos(tAngle) * tMinDist;
                            let cy2 = y2 - Math.sin(tAngle) * tMinDist;

                            if (forceVertical) {
                                let jointY = sType === 'joint-v' ? sy : ty;
                                let sDir = sType === 'joint-v' ? Math.sin(sAngle) : -Math.sin(tAngle);
                                let fixedMidY = jointY + (sDir > 0 ? trunkDrop : -trunkDrop);
                                g.find('path:not(.connection-hitbox)').attr('d', `M ${x1} ${y1} L ${cx1} ${cy1} L ${cx1} ${fixedMidY} L ${cx2} ${fixedMidY} L ${cx2} ${cy2} L ${x2} ${y2}`);
                            } else if (forceHorizontal) {
                                let jointX = sType === 'joint-h' ? sx : tx;
                                let sDir = sType === 'joint-h' ? Math.cos(sAngle) : -Math.cos(tAngle);
                                let fixedMidX = jointX + (sDir > 0 ? trunkDrop : -trunkDrop);
                                g.find('path:not(.connection-hitbox)').attr('d', `M ${x1} ${y1} L ${cx1} ${cy1} L ${fixedMidX} ${cy1} L ${fixedMidX} ${cy2} L ${cx2} ${cy2} L ${x2} ${y2}`);
                            } else {
                                let midX = (cx1 + cx2) / 2;
                                let midY = (cy1 + cy2) / 2;
                                let sIsH = Math.abs(Math.cos(sAngle)) > 0.5;
                                let tIsH = Math.abs(Math.cos(tAngle)) > 0.5;

                                if (sIsH || tIsH) {
                                    g.find('path:not(.connection-hitbox)').attr('d', `M ${x1} ${y1} L ${cx1} ${cy1} L ${midX} ${cy1} L ${midX} ${cy2} L ${cx2} ${cy2} L ${x2} ${y2}`);
                                } else {
                                    g.find('path:not(.connection-hitbox)').attr('d', `M ${x1} ${y1} L ${cx1} ${cy1} L ${cx1} ${midY} L ${cx2} ${midY} L ${cx2} ${cy2} L ${x2} ${y2}`);
                                }
                            }
                        }
                    } else {
                        g.find('line:not(.connection-hitbox)').attr({x1, y1, x2, y2});
                    }
                    
                    const label = viewport.find(`.connection-label[data-conn-id="${g.data('conn-id')}"]`);
                    if(label.length) label.css({left: `${(x1+x2)/2}px`, top: `${(y1+y2)/2}px`});
                }
            });
        };

        // ВЗАИМОДЕЙСТВИЕ И ИНСТРУМЕНТЫ (ЛКМ)
        html.find('.node-portrait, .group-hitbox, .group-name').on('mousedown', ev => {
            if (ev.button !== 0 || isLocked) return;
            
            if ($(ev.target).closest('.delete-node, .cycle-status').length) return; 
            
            const nodeEl = $(ev.currentTarget).closest('.board-node');
            const nodeData = this.actor.system.nodes.find(n => n.id === nodeEl.data("node-id"));
            if (this.boardState.tool === 'move' && $(ev.currentTarget).hasClass('group-hitbox') && nodeData.type === 'group') {
                return; 
            }

            ev.stopPropagation();
            const nodeId = nodeEl.data("node-id");
            const initialX = parseFloat(nodeEl.attr('data-x')); 
            const initialY = parseFloat(nodeEl.attr('data-y'));
            const initialW = parseFloat(nodeEl.attr('data-w')||70); 
            const initialH = parseFloat(nodeEl.attr('data-h')||70);
            const type = nodeEl.attr('data-type');
            const shape = nodeEl.attr('data-shape') || 'circle';
            
            if (this.boardState.tool === 'draw') {
                let linkingSource = nodeId;
                const isOrthogonal = this.boardState.style === 'orthogonal';
                const elDraw = isOrthogonal ? drawingPath : drawingLine;
                elDraw.attr({ stroke: this.boardState.color }).show();
                
                const onMove = e => {
                    const coords = getCanvasCoords(e);
                    const angle = Math.atan2(coords.y - initialY, coords.x - initialX);
                    
                    let drawAngle = angle;
                    let targetAngle = angle;

                    let forceVertical = type === 'joint-v';
                    let forceHorizontal = type === 'joint-h';

                    if (forceVertical) {
                        drawAngle = (coords.y - initialY) >= 0 ? Math.PI / 2 : -Math.PI / 2;
                        targetAngle = drawAngle;
                    } else if (forceHorizontal) {
                        drawAngle = (coords.x - initialX) >= 0 ? 0 : Math.PI;
                        targetAngle = drawAngle;
                    } else if (type === 'joint' || isOrthogonal) {
                        drawAngle = Math.round(drawAngle / (Math.PI / 2)) * (Math.PI / 2);
                        targetAngle = drawAngle;
                    }

                    const r = getIntersectionLive(type, shape, initialW, initialH, drawAngle);
                    const sX = initialX + Math.cos(drawAngle)*r; 
                    const sY = initialY + Math.sin(drawAngle)*r;
                    
                    if (isOrthogonal) {
                        let isJointNode = type.startsWith('joint');
                        if (!isJointNode) {
                            let midY = (sY + coords.y) / 2;
                            elDraw.attr('d', `M ${sX} ${sY} L ${sX} ${midY} L ${coords.x} ${midY} L ${coords.x} ${coords.y}`);
                        } else {
                            let minDist = 15;
                            let trunkDrop = 30;

                            let cx1 = sX + Math.cos(drawAngle) * minDist;
                            let cy1 = sY + Math.sin(drawAngle) * minDist;
                            
                            if (forceVertical) {
                                let fixedMidY = initialY + (Math.sin(drawAngle) > 0 ? trunkDrop : -trunkDrop);
                                elDraw.attr('d', `M ${sX} ${sY} L ${cx1} ${cy1} L ${cx1} ${fixedMidY} L ${coords.x} ${fixedMidY} L ${coords.x} ${coords.y}`);
                            } else if (forceHorizontal) {
                                let fixedMidX = initialX + (Math.cos(drawAngle) > 0 ? trunkDrop : -trunkDrop);
                                elDraw.attr('d', `M ${sX} ${sY} L ${cx1} ${cy1} L ${fixedMidX} ${cy1} L ${fixedMidX} ${coords.y} L ${coords.x} ${coords.y}`);
                            } else {
                                let sIsH = Math.abs(Math.cos(drawAngle)) > 0.5;
                                if (sIsH) {
                                    let midX = (cx1 + coords.x) / 2;
                                    elDraw.attr('d', `M ${sX} ${sY} L ${cx1} ${cy1} L ${midX} ${cy1} L ${midX} ${coords.y} L ${coords.x} ${coords.y}`);
                                } else {
                                    let midY = (cy1 + coords.y) / 2;
                                    elDraw.attr('d', `M ${sX} ${sY} L ${cx1} ${cy1} L ${cx1} ${midY} L ${cx2} ${midY} L ${coords.x} ${coords.y}`);
                                }
                            }
                        }
                    } else { 
                        elDraw.attr({ x1: sX, y1: sY, x2: coords.x, y2: coords.y }); 
                    }
                };
                
                const onUp = async e => {
                    $(document).off('mousemove', onMove);$(document).off('mouseup', onUp);
                    drawingLine.hide(); 
                    drawingPath.hide();
                    
                    const targetEl = $(e.target).closest('.node-portrait, .group-hitbox, .group-name');
                    if (targetEl.length) {
                        const targetId = targetEl.closest('.board-node').data("node-id");
                        if (targetId && targetId !== linkingSource) {
                            const conns = Array.from(this.actor.system.connections || []);
                            const existsIndex = conns.findIndex(c => (c.sourceId === linkingSource && c.targetId === targetId) || (c.targetId === linkingSource && c.sourceId === targetId));
                            const newConnData = {
                                id: existsIndex !== -1 ? conns[existsIndex].id : foundry.utils.randomID(10),
                                sourceId: linkingSource, 
                                targetId: targetId,
                                color: this.boardState.color, 
                                style: this.boardState.style, 
                                label: existsIndex !== -1 ? conns[existsIndex].label : ""
                            };
                            if (existsIndex !== -1) {
                                conns[existsIndex] = newConnData;
                            } else {
                                conns.push(newConnData);
                            }
                            this._saveUndoState();
                            await this.actor.update({"system.connections": conns});
                        }
                    }
                    linkingSource = null;
                };
                $(document).on('mousemove', onMove);$(document).on('mouseup', onUp);
            } 
            else if (this.boardState.tool === 'move') {
                let isSelected = nodeEl.hasClass('selected-node');
                
                if (!isSelected) { 
                    html.find('.board-node').removeClass('selected-node'); 
                    nodeEl.addClass('selected-node'); 
                    this.boardState.selectedNodes = [nodeId]; 
                }

                const selectedEls = html.find('.selected-node');
                const initialPositions = [];
                
                selectedEls.each((i, el) => {
                    initialPositions.push({
                        id: $(el).data('node-id'), 
                        el: $(el), 
                        x: parseFloat($(el).attr('data-x')), 
                        y: parseFloat($(el).attr('data-y')),
                        w: parseFloat($(el).attr('data-w')||70), 
                        h: parseFloat($(el).attr('data-h')||70), 
                        type: $(el).attr('data-type'),
                        shape: $(el).attr('data-shape') || 'circle'
                    });
                });

                let isDraggingNode = false;
                const startCoords = getCanvasCoords(ev);
                
                const onMove = e => {
                    const curCoords = getCanvasCoords(e);
                    const dx = curCoords.x - startCoords.x; 
                    const dy = curCoords.y - startCoords.y;
                    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) isDraggingNode = true;
                    
                    initialPositions.forEach(p => {
                        const nx = p.x + dx; 
                        const ny = p.y + dy;
                        p.el.css({ left: `${nx}px`, top: `${ny}px` });
                        p.el.attr('data-x', nx).attr('data-y', ny);
                        updateLinesLive(p.id, nx, ny, p.w, p.h, p.type, p.shape);
                    });
                };
                
                const onUp = async e => {
                    $(document).off('mousemove', onMove);$(document).off('mouseup', onUp);
                    
                    if (isDraggingNode) {
                        const curCoords = getCanvasCoords(e);
                        const dx = curCoords.x - startCoords.x; 
                        const dy = curCoords.y - startCoords.y;
                        const nodes = foundry.utils.deepClone(this.actor.system.nodes);
                        
                        initialPositions.forEach(p => {
                            const n = nodes.find(x => x.id === p.id);
                            if (n) { 
                                n.x = Math.round(p.x + dx); 
                                n.y = Math.round(p.y + dy); 
                            }
                        });
                        this._saveUndoState();
                        await this.actor.update({"system.nodes": nodes});
                    }
                };
                $(document).on('mousemove', onMove);$(document).on('mouseup', onUp);
            }
        });

        const drawingLine = html.find('#drawing-line');
        const drawingPath = html.find('#drawing-path');

        viewport.on('mousedown', ev => {
            if (ev.button !== 0 || isLocked) return;
            
            if ($(ev.target).closest('.node-portrait, .group-name, .record-name, .connection-hitbox, .group-resize-handle, .delete-node, .cycle-status').length) return;

            const startCoords = getCanvasCoords(ev);

            if (this.boardState.tool === 'move') {
                ev.preventDefault();
                const selBox = html.find('#selection-box');
                selBox.css({ left: startCoords.x, top: startCoords.y, width: 0, height: 0 }).show();
                
                if (!ev.shiftKey) { 
                    this.boardState.selectedNodes = []; 
                    html.find('.board-node').removeClass('selected-node'); 
                }

                const onMove = e => {
                    const curCoords = getCanvasCoords(e);
                    const minX = Math.min(startCoords.x, curCoords.x); 
                    const minY = Math.min(startCoords.y, curCoords.y);
                    const w = Math.abs(curCoords.x - startCoords.x); 
                    const h = Math.abs(curCoords.y - startCoords.y);
                    selBox.css({ left: minX, top: minY, width: w, height: h });

                    html.find('.board-node').each((i, el) => {
                        const nx = parseFloat($(el).attr('data-x')); 
                        const ny = parseFloat($(el).attr('data-y'));
                        if (nx >= minX && nx <= minX + w && ny >= minY && ny <= minY + h) {
                            $(el).addClass('selected-node');
                        } else if (!ev.shiftKey) {
                            $(el).removeClass('selected-node');
                        }
                    });
                };
                
                const onUp = () => {
                    $(document).off('mousemove', onMove);$(document).off('mouseup', onUp);
                    selBox.hide(); 
                    this.boardState.selectedNodes = [];
                    html.find('.selected-node').each((i, el) => this.boardState.selectedNodes.push($(el).data('node-id')));
                };
                
                $(document).on('mousemove', onMove);$(document).on('mouseup', onUp);
            }
            else if (this.boardState.tool === 'joint-v' || this.boardState.tool === 'joint-h') {
                ev.preventDefault();
                const newJoint = {
                    id: foundry.utils.randomID(10), 
                    type: this.boardState.tool, 
                    shape: "circle",
                    name: game.i18n.localize("KEXBORN.NewJoint"), 
                    color: this.boardState.color, 
                    x: startCoords.x, 
                    y: startCoords.y, 
                    width: 16, 
                    height: 16 
                };
                const nodes = Array.from(this.actor.system.nodes || []); 
                nodes.push(newJoint); 
                this._saveUndoState();
                this.actor.update({"system.nodes": nodes});
            }
            else if (this.boardState.tool === 'group') {
                ev.preventDefault();
                const shape = this.boardState.groupShape;
                const tempDiv = $(`<div style="position:absolute; border: 4px dashed ${this.boardState.color}; background: ${this.boardState.color}22; pointer-events: none; transform: translate(-50%, -50%); z-index: 999; border-radius: ${shape==='circle'?'50%':(shape==='square'||shape==='rect'?'8px':'0')};"></div>`);
                tempDiv.css({ left: startCoords.x, top: startCoords.y, width: 0, height: 0 }); 
                canvas.append(tempDiv);

                const onMove = e => {
                    const curCoords = getCanvasCoords(e);
                    let dx = Math.abs(curCoords.x - startCoords.x); 
                    let dy = Math.abs(curCoords.y - startCoords.y);
                    if (shape === 'circle' || shape === 'square') { 
                        let r = Math.max(dx, dy); 
                        dx = r; 
                        dy = r; 
                    }
                    tempDiv.css({ width: dx*2, height: dy*2 });
                };
                
                const onUp = async e => {
                    $(document).off('mousemove', onMove);$(document).off('mouseup', onUp);
                    const finalW = parseFloat(tempDiv.css('width')); 
                    const finalH = parseFloat(tempDiv.css('height'));
                    tempDiv.remove();
                    if (finalW > 30) {
                        const newGroup = { 
                            id: foundry.utils.randomID(10), 
                            type: "group", 
                            shape: shape, 
                            name: game.i18n.localize("KEXBORN.NewGroup"), 
                            color: this.boardState.color, 
                            x: startCoords.x, 
                            y: startCoords.y, 
                            width: finalW, 
                            height: finalH 
                        };
                        const nodes = Array.from(this.actor.system.nodes || []); 
                        nodes.push(newGroup); 
                        this._saveUndoState();
                        await this.actor.update({"system.nodes": nodes});
                    }
                };
                $(document).on('mousemove', onMove);$(document).on('mouseup', onUp);
            }
            else if (this.boardState.tool === 'record') {
                ev.preventDefault();
                const recordSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-150 -150 684 812'%3E%3Cg transform='rotate(-15 192 256)'%3E%3Cpath fill='%23ffffff' d='M224 136V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H248c-13.2 0-24-10.8-24-24zm160-14.1v6.1H256V0h6.1c6.4 0 12.5 2.5 17 7l97.9 98c4.5 4.5 7 10.6 7 16.9z'/%3E%3C/g%3E%3C/svg%3E";
                
                const newNode = {
                    id: foundry.utils.randomID(10), 
                    type: "record", 
                    shape: "circle", 
                    name: game.i18n.localize("KEXBORN.ToolRecord") || "Запись", 
                    uuid: "", 
                    img: recordSvg, 
                    status: "none",
                    x: startCoords.x, 
                    y: startCoords.y,
                    color: this.boardState.color
                };
                const nodes = Array.from(this.actor.system.nodes || []); 
                nodes.push(newNode); 
                this._saveUndoState();
                this.actor.update({"system.nodes": nodes});
            }
        });

        // СТАТУСЫ ПЕРСОНАЖЕЙ
        html.find('.cycle-status').click(async ev => {
            ev.preventDefault(); 
            ev.stopPropagation();
            const nodeId = $(ev.currentTarget).closest('.board-node').data("node-id");
            const nodes = foundry.utils.deepClone(this.actor.system.nodes);
            const n = nodes.find(x => x.id === nodeId);
            if (n) {
                const statuses = ["none", "dead", "unknown", "crossed", "check"];
                n.status = statuses[(statuses.indexOf(n.status || "none") + 1) % statuses.length];
                this._saveUndoState();
                await this.actor.update({"system.nodes": nodes});
            }
        });

        // НОЖ И ЗАМЕТКИ (ТЕКСТ НА ЛИНИЯХ)
        viewport.on('mousedown', '.connection-hitbox', async ev => {
            if (ev.button !== 0 || isLocked) return; 
            ev.stopPropagation(); 
            const connId = $(ev.currentTarget).parent().data("conn-id");
            
            if (this.boardState.tool === 'cut') {
                const newConns = this.actor.system.connections.filter(c => c.id !== connId); 
                this._saveUndoState();
                await this.actor.update({"system.connections": newConns});
            } else if (this.boardState.tool === 'note') {
                const conn = this.actor.system.connections.find(c => c.id === connId); 
                if (!conn) return;
                
                const dialogClasses = ["dialog", "kbm-window", `theme-${theme}`, "kbm-note-dialog"];
                new Dialog({
                    title: game.i18n.localize("KEXBORN.DialogThreadTextTitle"), 
                    content: `
                        <style>
                            .kbm-note-dialog .window-content { background: var(--kbm-bg-color) !important; color: var(--kbm-text) !important; border: 1px solid var(--kbm-border) !important; border-radius: 5px; }
                            .kbm-note-dialog .dialog-buttons { margin-top: 15px; }
                            .kbm-note-dialog .dialog-button { background: rgba(0,0,0,0.2) !important; border: 1px solid var(--kbm-border) !important; color: var(--kbm-text) !important; cursor: pointer; transition: 0.2s; font-family: var(--kbm-font-header); font-size: 16px; padding: 5px; border-radius: 4px; }
                            .kbm-note-dialog .dialog-button:hover { background: var(--kbm-border) !important; color: var(--kbm-bg-color) !important; }
                        </style>
                        <div style="margin-bottom: 10px; font-family: var(--kbm-font-body);">
                            <input type="text" id="conn-label" value="${conn.label || ''}" placeholder="${game.i18n.localize('KEXBORN.ThreadTextPlaceholder')}" style="width: 100%; padding: 5px; background: var(--kbm-input-bg); color: var(--kbm-input-text); border: 1px solid var(--kbm-border); border-radius: 4px;"/>
                        </div>
                    `,
                    buttons: {
                        ok: { 
                            label: game.i18n.localize("KEXBORN.Save"), 
                            callback: async (dHtml) => {
                                const conns = foundry.utils.deepClone(this.actor.system.connections);
                                const c = conns.find(x => x.id === connId);
                                if (c) { 
                                    c.label = dHtml.find('#conn-label').val(); 
                                    this._saveUndoState();
                                    await this.actor.update({"system.connections": conns}); 
                                }
                            }
                        },
                        clear: { 
                            label: game.i18n.localize("KEXBORN.Clear"), 
                            callback: async () => {
                                const conns = foundry.utils.deepClone(this.actor.system.connections);
                                const c = conns.find(x => x.id === connId);
                                if (c) { 
                                    c.label = ""; 
                                    this._saveUndoState();
                                    await this.actor.update({"system.connections": conns}); 
                                }
                            }
                        }
                    }, 
                    default: "ok"
                }, { classes: dialogClasses }).render(true);
            }
        });

        // ИЗМЕНЕНИЕ РАЗМЕРА ГРУППЫ
        html.find('.group-resize-handle').on('mousedown', ev => {
            if (ev.button !== 0 || isLocked) return; 
            ev.stopPropagation();
            
            const nodeEl = $(ev.currentTarget).closest('.board-node');
            const nodeId = nodeEl.data("node-id"); 
            const shape = nodeEl.data("shape");
            const centerX = parseFloat(nodeEl.attr('data-x')); 
            const centerY = parseFloat(nodeEl.attr('data-y'));
            const dir = $(ev.currentTarget).data('dir');
            let isResizing = false;

            const onMove = e => {
                const curCoords = getCanvasCoords(e);
                let nw = parseFloat(nodeEl.attr('data-w')); 
                let nh = parseFloat(nodeEl.attr('data-h'));
                
                if (dir === 'se') {
                    let dx = Math.abs(curCoords.x - centerX); 
                    let dy = Math.abs(curCoords.y - centerY);
                    if (shape === 'circle' || shape === 'square') { 
                        let r = Math.max(dx, dy); 
                        nw = r*2; 
                        nh = r*2; 
                    } else { 
                        nw = Math.max(60, dx*2); 
                        nh = Math.max(60, dy*2); 
                    }
                } else if (dir === 'e') { 
                    nw = Math.max(60, Math.abs(curCoords.x - centerX)*2); 
                } else if (dir === 's') { 
                    nh = Math.max(60, Math.abs(curCoords.y - centerY)*2); 
                }

                nodeEl.css({ width: `${nw}px`, height: `${nh}px` }); 
                nodeEl.attr('data-w', nw).attr('data-h', nh);
                updateLinesLive(nodeId, centerX, centerY, nw, nh, "group", shape); 
                isResizing = true;
            };
            
            const onUp = async e => {
                $(document).off('mousemove', onMove);$(document).off('mouseup', onUp);
                if (isResizing) {
                    const nodes = foundry.utils.deepClone(this.actor.system.nodes);
                    const n = nodes.find(x => x.id === nodeId);
                    if (n) { 
                        n.width = parseFloat(nodeEl.attr('data-w')); 
                        n.height = parseFloat(nodeEl.attr('data-h')); 
                        this._saveUndoState();
                        await this.actor.update({"system.nodes": nodes}); 
                    }
                }
            };
            $(document).on('mousemove', onMove);$(document).on('mouseup', onUp);
        });

        // УДАЛЕНИЕ УЗЛОВ КЛИКОМ НА КРЕСТИК
        html.find('.delete-node').click(async ev => {
            ev.preventDefault(); 
            ev.stopPropagation(); 
            const nodeId = $(ev.currentTarget).closest('.board-node').data("node-id");
            const newNodes = this.actor.system.nodes.filter(n => n.id !== nodeId);
            const newConns = (this.actor.system.connections || []).filter(c => c.sourceId !== nodeId && c.targetId !== nodeId);
            this._saveUndoState();
            await this.actor.update({ "system.nodes": newNodes, "system.connections": newConns });
        });

        // КЛИК ПО НАЗВАНИЮ ГРУППЫ (ИМЯ)
        html.find('.group-name').click(async ev => {
            ev.stopPropagation();
            if (isLocked) return;
            const nodeId = $(ev.currentTarget).closest('.board-node').data("node-id");
            const nodeData = this.actor.system.nodes.find(n => n.id === nodeId);
            
            const dialogClasses = ["dialog", "kbm-window", `theme-${theme}`, "kbm-note-dialog"];
            new Dialog({
                title: game.i18n.localize("KEXBORN.DialogGroupNameTitle"), 
                content: `
                    <style>
                        .kbm-note-dialog .window-content { background: var(--kbm-bg-color) !important; color: var(--kbm-text) !important; border: 1px solid var(--kbm-border) !important; border-radius: 5px; }
                        .kbm-note-dialog .dialog-buttons { margin-top: 15px; }
                        .kbm-note-dialog .dialog-button { background: rgba(0,0,0,0.2) !important; border: 1px solid var(--kbm-border) !important; color: var(--kbm-text) !important; cursor: pointer; transition: 0.2s; font-family: var(--kbm-font-header); font-size: 16px; padding: 5px; border-radius: 4px; }
                        .kbm-note-dialog .dialog-button:hover { background: var(--kbm-border) !important; color: var(--kbm-bg-color) !important; }
                    </style>
                    <div style="margin-bottom: 10px; font-family: var(--kbm-font-body);">
                        <input type="text" id="group-name" value="${nodeData.name}" style="width: 100%; padding: 5px; background: var(--kbm-input-bg); color: var(--kbm-input-text); border: 1px solid var(--kbm-border); border-radius: 4px;"/>
                    </div>
                `,
                buttons: { 
                    ok: { 
                        label: game.i18n.localize("KEXBORN.Save"), 
                        callback: async (dHtml) => {
                            const nodes = foundry.utils.deepClone(this.actor.system.nodes);
                            const n = nodes.find(x => x.id === nodeId);
                            if (n) { 
                                n.name = dHtml.find('#group-name').val(); 
                                this._saveUndoState();
                                await this.actor.update({"system.nodes": nodes}); 
                            }
                        }
                    }
                }
            }, { classes: dialogClasses }).render(true);
        });
    }

    async _onDrop(event) {
        if (!this.isEditable) return false;
        if (this.actor.getFlag("kexborn-connections", "sheetLocked") ?? true) { 
            ui.notifications.warn(game.i18n.localize("KEXBORN.WarnUnlock")); 
            return false; 
        }
        event.preventDefault();
        
        let data; 
        try { 
            data = JSON.parse(event.dataTransfer.getData("text/plain")); 
        } catch (err) { 
            return false; 
        }
        
        if (["Actor", "Item", "JournalEntry"].includes(data.type)) {
            const droppedDoc = await fromUuid(data.uuid);
            if (!droppedDoc) return;
            
            const viewport = this.element.find('.board-viewport')[0]; 
            const rect = viewport.getBoundingClientRect();
            const x = (event.clientX - rect.left - this.boardState.panX) / this.boardState.zoom;
            const y = (event.clientY - rect.top - this.boardState.panY) / this.boardState.zoom;

            let nodeType = "actor";
            let defaultImg = "icons/svg/mystery-man.svg";
            
            if (data.type === "Item") {
                nodeType = "item";
                defaultImg = "icons/svg/item-bag.svg";
            }
            if (data.type === "JournalEntry") {
                nodeType = "journal";
                defaultImg = "icons/svg/book.svg";
            }

            const newNode = {
                id: foundry.utils.randomID(10), 
                type: nodeType, 
                shape: "circle", 
                uuid: droppedDoc.uuid,
                name: droppedDoc.name, 
                img: droppedDoc.img || defaultImg, 
                status: "none",
                x: Math.round(x), 
                y: Math.round(y),
                color: "default"
            };
            
            const currentNodes = Array.from(this.actor.system.nodes || []);
            currentNodes.push(newNode); 
            this._saveUndoState();
            await this.actor.update({"system.nodes": currentNodes});
        }
    }
}

export class RatingSheet extends BaseActorSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ["sheet", "actor", "kbm-window", "kbm-rating-sheet"],
            template: "modules/kexborn-connections/templates/rating-sheet.html",
            width: 750,
            height: 700,
            resizable: true,
            scrollY: [".sheet-body"],
            dragDrop: [{ dragSelector: null, dropSelector: ".sheet-body" }]
        });
    }

    async getData() {
        const context = await super.getData();
        context.system = this.actor.system;
        context.isEditable = this.isEditable;
        context.theme = game.settings.get("kexborn-connections", "theme") || "dnd-dark";
        context.isLocked = this.actor.getFlag("kexborn-connections", "sheetLocked") ?? true;

        let entries = foundry.utils.deepClone(this.actor.system.entries || []);
        entries.sort((a, b) => b.score - a.score);
        entries.forEach((e, i) => e.rank = i + 1);
        
        context.entries = entries;
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);
        const isLocked = this.actor.getFlag("kexborn-connections", "sheetLocked") ?? true;
        const theme = game.settings.get("kexborn-connections", "theme") || "dnd-dark";

        // Блокировка/Разблокировка
        html.find('.sheet-lock').click(async ev => { 
            ev.preventDefault(); 
            await this.actor.setFlag("kexborn-connections", "sheetLocked", !isLocked); 
        });

        const contextMenu = html.find('#rating-context-menu');
        let activeContextEntryId = null;

        html.find('.sheet-body').on('contextmenu', ev => ev.preventDefault());

        // ПКМ по портрету
        html.find('.entry-portrait').on('mousedown', ev => {
            if (ev.button === 2) {
                ev.stopPropagation();
                activeContextEntryId = $(ev.currentTarget).closest('.entry-row').data('entry-id');
                
                const sheetBody = html.find('.sheet-body')[0];
                const rect = sheetBody.getBoundingClientRect();
                const px = ev.clientX - rect.left + sheetBody.scrollLeft;
                const py = ev.clientY - rect.top + sheetBody.scrollTop;
                
                contextMenu.css({ left: px + 'px', top: py + 'px', display: 'flex' });
            }
        });

        // Скрытие меню
        html.find('.sheet-body').on('mousedown', ev => {
            if (ev.button === 0 && contextMenu.is(':visible') && !$(ev.target).closest('#rating-context-menu').length) {
                contextMenu.hide();
                activeContextEntryId = null;
            }
        });

        // Открытие Арта (Работает без fromUuid напрямую из кеша)
        html.find('#show-image-btn').click(async ev => {
            ev.stopPropagation();
            if (!activeContextEntryId) return;
            const entry = this.actor.system.entries.find(x => x.id === activeContextEntryId);
            if (entry && entry.img) {
                new ImagePopout(entry.img, { title: entry.name, uuid: entry.uuid || "" }).render(true);
            }
            contextMenu.hide();
            activeContextEntryId = null;
        });

        // Открытие Листа
        html.find('#show-sheet-btn').click(async ev => {
            ev.stopPropagation();
            if (!activeContextEntryId) return;
            const entry = this.actor.system.entries.find(x => x.id === activeContextEntryId);
            if (entry && entry.uuid) {
                const doc = await fromUuid(entry.uuid);
                if (doc) {
                    doc.sheet.render(true);
                } else {
                    ui.notifications.warn("Нет доступа к листу персонажа или документ удален.");
                }
            }
            contextMenu.hide();
            activeContextEntryId = null;
        });

        // Логика глобального тултипа
        const globalTooltip = html.find('#global-note-tooltip');
        html.find('.note-cell').hover(
            (ev) => {
                const name = $(ev.currentTarget).data('name');
                const note = $(ev.currentTarget).data('note');
                if (!note) return;

                globalTooltip.find('.tooltip-header').text(name);
                globalTooltip.find('.tooltip-body').text(note);

                const cellRect = ev.currentTarget.getBoundingClientRect();
                const formRect = this.element[0].getBoundingClientRect();

                const top = cellRect.top - formRect.top + (cellRect.height / 2);
                const right = formRect.right - cellRect.left + 15;

                globalTooltip.css({
                    display: 'block',
                    opacity: 1,
                    top: top + 'px',
                    right: right + 'px'
                });
            },
            () => {
                globalTooltip.css({ display: 'none', opacity: 0 });
            }
        );

        // Открытие большой заметки
        html.find('.entry-long-note').click(async ev => {
            ev.preventDefault();
            const id = $(ev.currentTarget).closest('.entry-row').data('entry-id');
            const entry = this.actor.system.entries.find(x => x.id === id);
            if (!entry) return;

            const dialogClasses = ["dialog", "kbm-window", `theme-${theme}`, "kbm-note-dialog"];
            const styleBlock = `
                <style>
                    .kbm-note-dialog .window-content { background: var(--kbm-bg-color) !important; color: var(--kbm-text) !important; border: 1px solid var(--kbm-border) !important; border-radius: 5px; }
                    .kbm-note-dialog .dialog-buttons { margin-top: 15px; }
                    .kbm-note-dialog .dialog-button { background: rgba(0,0,0,0.2) !important; border: 1px solid var(--kbm-border) !important; color: var(--kbm-text) !important; cursor: pointer; transition: 0.2s; font-family: var(--kbm-font-header); font-size: 16px; padding: 5px; border-radius: 4px; }
                    .kbm-note-dialog .dialog-button:hover { background: var(--kbm-border) !important; color: var(--kbm-bg-color) !important; }
                    .kbm-note-dialog select option { background-color: #222 !important; color: #fff !important; }
                </style>
            `;

            if (isLocked || !this.isEditable) {
                new Dialog({
                    title: `${game.i18n.localize("KEXBORN.DialogNoteTitle")} ${entry.name}`,
                    content: styleBlock + `<div style="padding: 15px; font-size: 15px; white-space: pre-wrap; font-family: var(--kbm-font-body); color: var(--kbm-text); min-height: 150px; background: rgba(0,0,0,0.1); border: 1px dashed var(--kbm-border-subtle); border-radius: 4px; margin-top: 5px;">${entry.longNote || game.i18n.localize("KEXBORN.NoRecords")}</div>`,
                    buttons: { close: { label: game.i18n.localize("KEXBORN.Close") } },
                    default: "close"
                }, { width: 500, classes: dialogClasses }).render(true);
            } else {
                new Dialog({
                    title: `${game.i18n.localize("KEXBORN.DialogNoteTitle")} ${entry.name}`,
                    content: styleBlock + `
                        <div style="padding: 10px 0; height: 100%;">
                            <textarea id="long-note-${id}" style="width: 100%; height: 250px; font-family: var(--kbm-font-body); font-size: 14px; padding: 10px; background: var(--kbm-input-bg); color: var(--kbm-input-text); border: 1px solid var(--kbm-border); border-radius: 4px; resize: none;">${entry.longNote || ""}</textarea>
                        </div>
                    `,
                    buttons: {
                        save: {
                            label: game.i18n.localize("KEXBORN.Save"),
                            callback: async (dHtml) => {
                                const val = dHtml.find(`#long-note-${id}`).val();
                                const entries = foundry.utils.deepClone(this.actor.system.entries);
                                const e = entries.find(x => x.id === id);
                                if (e) {
                                    e.longNote = val;
                                    await this.actor.update({"system.entries": entries});
                                }
                            }
                        }
                    },
                    default: "save"
                }, { width: 500, classes: dialogClasses }).render(true);
            }
        });

        if (!this.isEditable || isLocked) return;

        // Настройка заголовка столбца "Слава" (Шестеренка)
        html.find('.config-score-label').hover(
            function() { $(this).css('color', 'var(--kbm-text)'); },
            function() { $(this).css('color', 'var(--kbm-text-muted)'); }
        ).click(async ev => {
            ev.preventDefault();
            const currentLabel = this.actor.system.scoreLabel || game.i18n.localize("KEXBORN.MeasureGlory");
            const dialogClasses = ["dialog", "kbm-window", `theme-${theme}`, "kbm-note-dialog"];
            const styleBlock = `
                <style>
                    .kbm-note-dialog .window-content { background: var(--kbm-bg-color) !important; color: var(--kbm-text) !important; border: 1px solid var(--kbm-border) !important; border-radius: 5px; }
                    .kbm-note-dialog .dialog-buttons { margin-top: 15px; }
                    .kbm-note-dialog .dialog-button { background: rgba(0,0,0,0.2) !important; border: 1px solid var(--kbm-border) !important; color: var(--kbm-text) !important; cursor: pointer; transition: 0.2s; font-family: var(--kbm-font-header); font-size: 16px; padding: 5px; border-radius: 4px; }
                    .kbm-note-dialog .dialog-button:hover { background: var(--kbm-border) !important; color: var(--kbm-bg-color) !important; }
                    .kbm-note-dialog select option { background-color: #222 !important; color: #fff !important; }
                </style>
            `;

            new Dialog({
                title: game.i18n.localize("KEXBORN.ColumnConfig"),
                content: styleBlock + `
                    <div style="padding: 10px;">
                        <label style="font-family: var(--kbm-font-header); font-size: 16px; display: block; margin-bottom: 5px; color: var(--kbm-text);">${game.i18n.localize('KEXBORN.MeasureName')}</label>
                        <select id="score-label-select" style="width: 100%; padding: 5px; background: var(--kbm-input-bg); color: var(--kbm-input-text); border: 1px solid var(--kbm-border); border-radius: 4px; font-family: var(--kbm-font-body);">
                            <option value="${game.i18n.localize('KEXBORN.MeasureGlory')}" ${currentLabel === game.i18n.localize('KEXBORN.MeasureGlory') ? 'selected' : ''}>${game.i18n.localize('KEXBORN.MeasureGlory')}</option>
                            <option value="${game.i18n.localize('KEXBORN.MeasurePower')}" ${currentLabel === game.i18n.localize('KEXBORN.MeasurePower') ? 'selected' : ''}>${game.i18n.localize('KEXBORN.MeasurePower')}</option>
                            <option value="${game.i18n.localize('KEXBORN.MeasureRating')}" ${currentLabel === game.i18n.localize('KEXBORN.MeasureRating') ? 'selected' : ''}>${game.i18n.localize('KEXBORN.MeasureRating')}</option>
                        </select>
                    </div>
                `,
                buttons: {
                    save: {
                        label: game.i18n.localize("KEXBORN.Save"),
                        callback: async (dHtml) => {
                            const newLabel = dHtml.find('#score-label-select').val();
                            await this.actor.update({"system.scoreLabel": newLabel});
                        }
                    }
                },
                default: "save"
            }, { width: 300, classes: dialogClasses }).render(true);
        });

        // Сохранение короткой заметки
        html.find('.entry-short-note').change(async ev => {
            const id = $(ev.currentTarget).closest('.entry-row').data('entry-id');
            const entries = foundry.utils.deepClone(this.actor.system.entries);
            const e = entries.find(x => x.id === id);
            if (e) {
                e.shortNote = ev.target.value;
                await this.actor.update({"system.entries": entries});
            }
        });

        // Сохранение славы
        html.find('.entry-score').change(async ev => {
            const id = $(ev.currentTarget).closest('.entry-row').data('entry-id');
            const entries = foundry.utils.deepClone(this.actor.system.entries);
            const e = entries.find(x => x.id === id);
            if (e) {
                e.score = Number(ev.target.value) || 0;
                entries.sort((a, b) => b.score - a.score); 
                entries.forEach((x, i) => x.rank = i + 1); 
                await this.actor.update({"system.entries": entries});
            }
        });

        // Удаление участника
        html.find('.entry-delete').click(async ev => {
            const id = $(ev.currentTarget).closest('.entry-row').data('entry-id');
            let entries = foundry.utils.deepClone(this.actor.system.entries).filter(x => x.id !== id);
            entries.sort((a, b) => b.score - a.score);
            entries.forEach((x, i) => x.rank = i + 1);
            await this.actor.update({"system.entries": entries});
        });
    }

    async _onDrop(event) {
        if (!this.isEditable) return false;
        if (this.actor.getFlag("kexborn-connections", "sheetLocked") ?? true) { 
            ui.notifications.warn(game.i18n.localize("KEXBORN.WarnUnlock")); 
            return false; 
        }
        event.preventDefault();
        
        let data;
        try { 
            data = JSON.parse(event.dataTransfer.getData("text/plain")); 
        } catch (err) { 
            return false; 
        }
        
        if (data.type === "Actor") {
            const droppedActor = await fromUuid(data.uuid);
            if (!droppedActor) return;
            
            const entries = Array.from(this.actor.system.entries || []);
            
            if (entries.find(e => e.uuid === droppedActor.uuid)) {
                ui.notifications.warn(`"${droppedActor.name}" ${game.i18n.localize("KEXBORN.WarnAlreadyInRating")}`);
                return;
            }

            entries.push({
                id: foundry.utils.randomID(10),
                uuid: droppedActor.uuid,
                name: droppedActor.name,
                img: droppedActor.img,
                shortNote: "",
                longNote: "",
                score: 0,
                rank: entries.length + 1
            });

            entries.sort((a, b) => b.score - a.score);
            entries.forEach((x, i) => x.rank = i + 1);

            await this.actor.update({"system.entries": entries});
        }
    }
}