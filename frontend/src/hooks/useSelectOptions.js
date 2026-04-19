import { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import { cabinetAPI, clientAPI, eventAPI, roomAPI } from '../api';
import { extractListData } from '../api/pagination';

const LOCALE = 'zh-CN';

export const compareText = (left, right) =>
  String(left || '').localeCompare(String(right || ''), LOCALE);

export const sortClientsByName = (left, right) =>
  compareText(left?.name, right?.name);

export const sortRoomsByName = (left, right) =>
  compareText(left?.name, right?.name);

export const sortCabinetsByRoomAndName = (left, right) => {
  const roomCompare = compareText(left?.room_name, right?.room_name);
  if (roomCompare !== 0) {
    return roomCompare;
  }
  return compareText(left?.name, right?.name);
};

export const sortEventsByDateDesc = (left, right) => {
  const leftTime = new Date(`${left?.date || ''} ${left?.start_time || '00:00'}`).getTime();
  const rightTime = new Date(`${right?.date || ''} ${right?.start_time || '00:00'}`).getTime();
  return rightTime - leftTime;
};

export const mapClientOption = (client) => ({
  value: client.id,
  label: client.name || '-',
});

export const mapCabinetOption = (cabinet) => ({
  value: cabinet.id,
  label: cabinet.room_name ? `${cabinet.name} (${cabinet.room_name})` : (cabinet.name || '-'),
});

export const mapEventOption = (event) => ({
  value: event.id,
  label: event.order_number
    ? `${event.order_number} (${event.date || '-'})`
    : `事件 #${event.id} (${event.date || '-'})`,
});

export const mapRoomOption = (room) => ({
  value: room.id,
  label: room.name || '-',
});

export const filterCabinetsByRoomIds = (cabinets = [], roomIds = []) => {
  if (!Array.isArray(roomIds) || roomIds.length === 0) {
    return [];
  }

  const roomIdSet = new Set(
    roomIds
      .map((roomId) => Number.parseInt(roomId, 10))
      .filter((roomId) => !Number.isNaN(roomId))
  );

  return cabinets.filter((cabinet) => {
    const roomValue = typeof cabinet?.room === 'object' && cabinet?.room !== null
      ? (cabinet.room.id ?? cabinet.room)
      : cabinet?.room;
    const roomId = Number.parseInt(roomValue, 10);
    return !Number.isNaN(roomId) && roomIdSet.has(roomId);
  });
};

const useOptionLoader = (fetcher, options = {}) => {
  const {
    immediate = true,
    enabled = true,
    errorMessage = '获取选项失败',
    sortItems,
    mapItemToOption,
  } = options;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setLoaded(false);
      setError(null);
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetcher();
      const list = extractListData(response);
      const nextItems = sortItems ? [...list].sort(sortItems) : list;
      setItems(nextItems);
      setLoaded(true);
      return nextItems;
    } catch (err) {
      console.error(errorMessage, err);
      setError(err);
      message.error(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [enabled, errorMessage, fetcher, sortItems]);

  const ensureLoaded = useCallback(async () => {
    if (loaded || loading) {
      return items;
    }
    return load();
  }, [items, load, loaded, loading]);

  useEffect(() => {
    if (!immediate || !enabled) {
      if (!enabled) {
        setItems([]);
        setLoaded(false);
        setError(null);
      }
      return;
    }

    load().catch(() => {});
  }, [enabled, immediate, load]);

  const selectOptions = useMemo(
    () => items.map(mapItemToOption),
    [items, mapItemToOption]
  );

  return {
    items,
    options: selectOptions,
    loading,
    loaded,
    error,
    reload: load,
    ensureLoaded,
  };
};

export const useClientOptions = (options = {}) => {
  const fetchClients = useCallback(() => clientAPI.getAllClients(), []);

  return useOptionLoader(fetchClients, {
    errorMessage: '获取客户列表失败',
    sortItems: sortClientsByName,
    mapItemToOption: mapClientOption,
    ...options,
  });
};

export const useCabinetOptions = (options = {}) => {
  const fetchCabinets = useCallback(() => cabinetAPI.getAllCabinets(), []);

  return useOptionLoader(fetchCabinets, {
    errorMessage: '获取机柜列表失败',
    sortItems: sortCabinetsByRoomAndName,
    mapItemToOption: mapCabinetOption,
    ...options,
  });
};

export const useRoomOptions = (options = {}) => {
  const fetchRooms = useCallback(() => roomAPI.getRooms(), []);

  return useOptionLoader(fetchRooms, {
    errorMessage: '获取机房列表失败',
    sortItems: sortRoomsByName,
    mapItemToOption: mapRoomOption,
    ...options,
  });
};

export const useEventOptions = (options = {}) => {
  const fetchEvents = useCallback(() => eventAPI.getAllEvents(), []);

  return useOptionLoader(fetchEvents, {
    immediate: false,
    errorMessage: '获取事件列表失败',
    sortItems: sortEventsByDateDesc,
    mapItemToOption: mapEventOption,
    ...options,
  });
};

export default useOptionLoader;
