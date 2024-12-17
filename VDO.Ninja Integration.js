// ==UserScript==
// @name         OBS - VDO.Ninja Integration
// @namespace    http://tampermonkey.net/
// @version      0.5
// @description  Automatically adds and removes new VDO.Ninja guests to/from OBS scenes
// @author       Morse
// @match        https://vdo.ninja/?director=*
// @grant        none
// ==/UserScript==
(function () {
    'use strict';

    const OBS_WEBSOCKET_URL = "ws://localhost:4444";
    const OBS_PASSWORD = "ANONYMOUS";
    const prefix = "CAM_VDO";
    const SCENES = ["Cameras", "Reagindo", "Destaque"];
    let pairsList = [];
    let obsSocket;

    function connectOBS() {
        obsSocket = new WebSocket(OBS_WEBSOCKET_URL);
        obsSocket.onopen = () => {
            console.log("Conectado ao OBS WebSocket");
            if (OBS_PASSWORD) {
                obsSocket.send(JSON.stringify({
                    op: 1,
                    d: {
                        rpcVersion: 1,
                        authentication: OBS_PASSWORD
                    }
                }));
            }
        };
        obsSocket.onerror = (error) => {
            console.error("Erro na conexão com o OBS WebSocket", error);
        };
        obsSocket.onclose = () => {
            console.log("Desconectado do OBS WebSocket. Tentando reconectar...");
            setTimeout(connectOBS, 5000);
        };
    }

    connectOBS();

    function sendToOBS(requestType, requestData, callback) {
        if (obsSocket.readyState === WebSocket.OPEN) {
            obsSocket.send(JSON.stringify({
                op: 6,
                d: {
                    requestType,
                    requestId: Math.random().toString(36).substr(2, 9),
                    requestData
                }
            }));
        } else {
            console.warn("WebSocket não está aberto. Comando ignorado:", requestType);
        }
        if (callback) {
            obsSocket.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.op === 7) {
                    callback(message.d);
                }
            };
        }
    }

    function getSceneItemId(sceneName, sourceName, callback) {
        sendToOBS("GetSceneItemList", { sceneName: sceneName }, (response) => {
            // Imprime a resposta no console
            console.log("Resposta da requisição GetSceneItemList:", response);

            if (response?.responseData?.sceneItems) {
                const item = response.responseData.sceneItems.find(i => i.sourceName === sourceName);
                callback(item ? item.sceneItemId : null);
            } else {
                callback(null);
            }
        });
    }

    async function getSceneItemIdAsync(sceneName, sourceName) {
        return new Promise(resolve => {
            getSceneItemId(sceneName, sourceName, (sceneItemId) => {
                resolve({ sceneName, sceneItemId });
            });
        });
    }

    async function removeSource(sourceName) {
        const itemIDS = [];
        for (const sceneName of SCENES) {
            const item = await getSceneItemIdAsync(sceneName, sourceName);
            itemIDS.push(item);
        }

        // Agora processamos apenas pares SCENES[i] e itemIDS[i]
        for (let i = 0; i < SCENES.length; i++) {
            const sceneName = SCENES[i];
            const item = itemIDS[i];

            if (item.sceneItemId) {
                console.log("Removendo ID:", item.sceneItemId, "da cena:", sceneName);
                sendToOBS("RemoveSceneItem", {
                    sceneName: sceneName,
                    sceneItemId: item.sceneItemId
                });
            } else {
                console.log("Nenhum ID encontrado para a cena:", sceneName);
            }
        }
    }


    function addSourceToOtherScenes(sourceName) {
        getSceneItemId(SCENES[0], sourceName, (sceneItemId) => {
            if (sceneItemId) {
                SCENES.slice(1).forEach(otherScene => {
                    sendToOBS("CreateSceneItem", {
                        sceneName: otherScene,
                        sourceName: sourceName,
                        sceneItemId: sceneItemId
                    });
                });
            } else {
                console.error(`Não foi possível encontrar o ID da fonte ${sourceName} para replicação.`);
            }
        });
    }

    function updatePairs() {
        const vidconDivs = document.querySelectorAll('div.vidcon.directorMargins');
        const currentPairs = [];

        vidconDivs.forEach(div => {
            // Detecção de participantes
            const linkElement = div.querySelector('a.soloLink.advanced.task[data-sololink="true"]');
            const labelElement = div.querySelector('span.contolboxLabel');

            if (linkElement && labelElement) {
                currentPairs.push({
                    link: linkElement.getAttribute('value'),
                    label: labelElement.textContent.trim()
                });
            }

            // Detecção do diretor
            const directorLinkElement = div.querySelector('a.soloLink.advanced.task[data-sololink="true"]');
            const directorLabelElement = div.querySelector('span#label_director');

            if (directorLinkElement && directorLabelElement) {
                currentPairs.push({
                    link: directorLinkElement.getAttribute('value'),
                    label: `Director_${directorLabelElement.textContent.trim()}`
                });
            }
        });

        // Remoção de fontes antigas
        pairsList.forEach(pair => {
            if (!currentPairs.find(p => p.link === pair.link && p.label === pair.label)) {
                const sourceName = `${prefix}_${pair.label}`;
                removeSource(sourceName);
            }
        });

        // Adição de novas fontes
        currentPairs.forEach(pair => {
            const sourceName = `${prefix}_${pair.label}`;
            // Verifica se o label não é "Add a label" e se o link ainda não foi adicionado
            if (pair.label !== "Director_Add a label" && pair.label !== "Add a label" && !pairsList.some(p => p.link === pair.link)) {
                sendToOBS("CreateInput", {
                    sceneName: SCENES[0],
                    inputName: sourceName,
                    inputKind: "browser_source",
                    inputSettings: {
                        url: pair.link,
                        width: 1920,
                        height: 1080
                    }
                }, () => {
                    addSourceToOtherScenes(sourceName);
                });
            }
        });

        pairsList = currentPairs;
    }

    setInterval(updatePairs, 100);
})();