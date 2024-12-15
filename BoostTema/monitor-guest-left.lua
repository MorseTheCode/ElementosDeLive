obs = obslua

-- Variável para armazenar o nome da fonte a ser removida
local source_to_remove = ""

-- Função para verificar e remover a fonte de todas as cenas
function remove_source_from_all_scenes(source_name)
    local scenes = obs.obs_frontend_get_scenes()
    for _, scene in ipairs(scenes) do
        local scene_name = obs.obs_source_get_name(scene)

        -- Evita verificar a cena monitorada
        if scene_name ~= scene_to_monitor then
            local scene_obj = obs.obs_scene_from_source(scene)  -- Obtém a cena a partir da fonte
            local scene_items = obs.obs_scene_enum_items(scene_obj)  -- Enumera os itens da cena
            
            -- Itera sobre os itens da cena
            for _, scene_item in ipairs(scene_items) do
                local item_source = obs.obs_sceneitem_get_source(scene_item)
                if item_source and obs.obs_source_get_name(item_source) == source_name then
                    -- Remove o item de cena
                    obs.obs_sceneitem_remove(scene_item)  -- Usando obs_sceneitem_remove
                    print("Fonte " .. source_name .. " removida da cena: " .. scene_name)
                    break
                end
            end

            -- Libera a memória dos itens da cena
            obs.sceneitem_list_release(scene_items)
        end
    end
end

-- Função para atualizar e monitorar periodicamente
function script_update(settings)
    -- Atualiza o nome da fonte a ser removida a partir das configurações
    source_to_remove = obs.obs_data_get_string(settings, "source_name")
    
    -- Se uma fonte foi definida, remove da lista de todas as cenas
    if source_to_remove ~= "" then
        remove_source_from_all_scenes(source_to_remove)
    end
end

-- Função chamada para descrever o script
function script_description()
    return "Remove uma fonte com o nome especificado de todas as cenas onde ela estiver."
end

-- Função para adicionar a propriedade de nome da fonte no script
function script_properties()
    local props = obs.obs_properties_create()
    obs.obs_properties_add_text(props, "source_name", "Nome da Fonte", obs.OBS_TEXT_DEFAULT)
    return props
end
