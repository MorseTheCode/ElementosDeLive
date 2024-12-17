// ==UserScript==
// @name         OBS - VDO.Ninja Integration
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Automatically adds and removes new VDO.Ninja guests to/from OBS scenes
// @author       Morse
// @match        https://vdo.ninja/?director=*
// @grant        none
// ==/UserScript==
(async function () {
    'use strict';

    const OBS_WEBSOCKET_URL = "ws://localhost:4455";
    const LOGIN = "ANONYMOUS";
    const prefix = "CAM_VDO";
    const SCENES = ["Cameras", "Reagindo", "Destaque"];
    const css = `body::after {
    content: "";
    position: fixed;
    top: 50%; /* Centraliza verticalmente */
    left: 50%; /* Centraliza horizontalmente */
    width: 100%;
    height: 100%;
    background-image: url("https://morsethecode.github.io/ElementosDeLive/BoostTema/files/Overlays/Boost_Webcam.png");
    background-size: cover;
    background-repeat: no-repeat;
    transform: translate(-50%, -50%); /* Centraliza */
    z-index: 1;
    pointer-events: none;
}
`
    let pairsList = [];
    let obsSocket;

    async function connectOBS() {
        return new Promise((resolve, reject) => {
            obsSocket = new WebSocket(OBS_WEBSOCKET_URL);

            obsSocket.onopen = () => {
                console.log("Conectado ao OBS WebSocket");
                if (LOGIN) {
                    obsSocket.send(JSON.stringify({
                        op: 1,
                        d: {
                            rpcVersion: 1,
                            authentication: LOGIN
                        }
                    }));
                }
                resolve();
            };

            obsSocket.onerror = (error) => {
                console.error("Erro na conexão com o OBS WebSocket", error);
                reject(error);
            };

            obsSocket.onclose = () => {
                console.log("Desconectado do OBS WebSocket. Tentando reconectar...");
                setTimeout(connectOBS, 3000);
            };
        });
    }

    await connectOBS();

    async function sendToOBS(requestType, requestData) {
        return new Promise((resolve, reject) => {
            if (obsSocket.readyState === WebSocket.OPEN) {
                const requestId = Math.random().toString(36).substr(2, 9);

                obsSocket.send(JSON.stringify({
                    op: 6,
                    d: {
                        requestType,
                        requestId,
                        requestData
                    }
                }));

                obsSocket.onmessage = (event) => {
                    const message = JSON.parse(event.data);
                    if (message.op === 7 && message.d.requestId === requestId) {
                        resolve(message.d);
                    }
                };
            } else {
                console.warn("WebSocket não está aberto. Comando ignorado:", requestType);
                reject("WebSocket não está aberto.");
            }
        });
    }

    async function getSceneItemId(sceneName, sourceName) {
        const response = await sendToOBS("GetSceneItemList", { sceneName });
        if (response?.responseData?.sceneItems) {
            const item = response.responseData.sceneItems.find(i => i.sourceName === sourceName);
            return item ? item.sceneItemId : null;
        }
        return null;
    }

    function extractViewId(link) {
        const match = link.match(/view=([^&]+)/);
        return match ? match[1] : null;
    }

    async function triggerStudioTransition() {
        await sendToOBS("TriggerStudioModeTransition", {});
        console.log("Transição acionada no Modo Estúdio");
    }

    async function addSourceToOtherScenes(sourceName) {
        const sceneItemId = await getSceneItemId(SCENES[0], sourceName);
        if (sceneItemId) {
            for (const otherScene of SCENES.slice(1)) {
                const exists = await getSceneItemId(otherScene, sourceName);
                if (!exists){
                    await sendToOBS("CreateSceneItem", {
                        sceneName: otherScene,
                        sourceName,
                        sceneItemId
                    });
                }
            }
        } else {
            console.error(`Não foi possível encontrar o ID da fonte ${sourceName} para replicação.`);
        }
    }

    async function renameSource(oldName, newName) {
        await sendToOBS("SetInputName", {
            inputName: oldName,
            newInputName: newName
        });
    }

    async function removeSource(sourceName) {
        const itemIDS = [];
        for (const sceneName of SCENES) {
            const sceneItemId = await getSceneItemId(sceneName, sourceName);
            itemIDS.push({ sceneName, sceneItemId });
        }

        for (const { sceneName, sceneItemId } of itemIDS) {
            if (sceneItemId) {
                console.log("Removendo ID:", sceneItemId, "da cena:", sceneName);
                await sendToOBS("RemoveSceneItem", {
                    sceneName,
                    sceneItemId
                });
            } else {
                console.log("Nenhum ID", sceneItemId, "encontrado para a cena:", sceneName);
            }
        }
        await triggerStudioTransition();
    }

    async function updatePairs() {
        const vidconDivs = document.querySelectorAll('div.vidcon.directorMargins');
        const currentPairs = [];

        vidconDivs.forEach(div => {
            const linkElement = div.querySelector('a.soloLink.advanced.task[data-sololink="true"]');
            const labelElement = div.querySelector('span.contolboxLabel');
            if (linkElement && labelElement) {
                currentPairs.push({
                    link: `${linkElement.getAttribute('value')}&autogain=0`,
                    viewId: extractViewId(linkElement.getAttribute('value')),
                    label: `${labelElement.textContent.trim()}_${extractViewId(linkElement.getAttribute('value'))}`,
                    css: css
                });
            }

            const directorLinkElement = div.querySelector('a.soloLink.advanced.task[data-sololink="true"]');
            const directorLabelElement = div.querySelector('span#label_director');

            if (directorLinkElement && directorLabelElement) {
                currentPairs.push({
                    link: `${directorLinkElement.getAttribute('value')}&autogain=0`,
                    viewId: extractViewId(directorLinkElement.getAttribute('value')),
                    label: `${directorLabelElement.textContent.trim()}_${extractViewId(directorLinkElement.getAttribute('value'))}`,
                    css: css
                });
            }
        });

        for (const pair of pairsList) {
            const currentPair = currentPairs.find(p => p.viewId === pair.viewId);
            if (!currentPair) {
                const sourceName = `${prefix}_${pair.label}`;
                await removeSource(sourceName);

                const index = pairsList.indexOf(pair);
                if (index > -1) {
                    pairsList.splice(index, 1);
                }
            } else if ((currentPair) && (currentPair.label !== pair.label)) {
                const oldName = `${prefix}_${pair.label}`;
                const newName = `${prefix}_${currentPair.label}`;
                await renameSource(oldName, newName);
                console.log(`Atualizando label para ID ${pair.viewId}: ${pair.label} -> ${currentPair.label}`);
                pair.label = currentPair.label;
            }
        }

        for (const pair of currentPairs) {
            if (!pairsList.some(p => p.viewId === pair.viewId)) {
                const sourceName = `${prefix}_${pair.label}`;
                await sendToOBS("CreateInput", {
                    sceneName: SCENES[0],
                    inputName: sourceName,
                    inputKind: "browser_source",
                    inputSettings: {
                        url: pair.link,
                        css: pair.css,
                        reroute_audio: true,
                        width: 1920,
                        height: 1080
                    }
                });
                await addSourceToOtherScenes(sourceName);
                pairsList.push(pair);
            }
        }
    }

    setInterval(updatePairs, 1000);
})();