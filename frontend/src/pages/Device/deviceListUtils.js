export const buildDeviceListParams = ({
  page = 1,
  pageSize = 15,
  searchText = '',
  cabinetId = null,
  clientId = null,
  installDateSortOrder = null,
  deviceType = null,
} = {}) => {
  const params = {
    page,
    page_size: pageSize,
  };

  if ((searchText || '').trim()) {
    params.search = searchText.trim();
  }

  if (cabinetId) {
    params.cabinet = cabinetId;
  }

  const normalizedClientId =
    clientId != null && clientId !== '' ? Number(clientId) : null;

  if (normalizedClientId != null && !Number.isNaN(normalizedClientId)) {
    params.client = normalizedClientId;
  }

  if (deviceType) {
    params.device_type = deviceType;
  }

  if (installDateSortOrder === 'descend') {
    params.ordering = '-installation_date';
  } else if (installDateSortOrder === 'ascend') {
    params.ordering = 'installation_date';
  }

  return params;
};

export const normalizeDeviceList = (list = []) =>
  list.map((device) => {
    const eventDetails = device.event_details || [];
    const latestEvent = eventDetails.reduce(
      (latest, eventItem) =>
        !latest || new Date(eventItem.date) > new Date(latest.date) ? eventItem : latest,
      null
    );

    return {
      ...device,
      cabinet_name: device.cabinet_name || '-',
      room_name: device.room_name || '-',
      order_number: device.order_number || '-',
      installation_date: device.installation_date || '-',
      client_name: device.client_name || '-',
      client_authorized_person: device.client_authorized_person || '-',
      authorized_org_name: device.authorized_org_name || '-',
      device_type: device.device_type || 'other',
      power_wattage: device.power_wattage || 0,
      key: device.id,
      event_details: eventDetails,
      event_order_number: latestEvent?.order_number || '-',
      event_date: latestEvent?.date || '-',
      event_description: latestEvent?.description || '-',
      event_client_name: latestEvent?.clients?.[0]?.name || '-',
      event_client_authorized_person: latestEvent?.clients?.[0]?.authorized_person || '-',
      event_authorized_org_name: (
        latestEvent?.authorized_orgs?.length
          ? latestEvent.authorized_orgs.map((org) => org.name).join('、')
          : null
      ) || '-',
    };
  });
