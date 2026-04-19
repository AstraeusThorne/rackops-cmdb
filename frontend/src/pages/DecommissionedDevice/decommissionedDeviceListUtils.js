const getLatestEvent = (relatedEvents = []) =>
  relatedEvents.reduce((latest, current) => {
    if (!latest) {
      return current;
    }

    return new Date(current?.date) > new Date(latest?.date) ? current : latest;
  }, null);

export const buildDecommissionedDeviceListParams = ({
  page = 1,
  pageSize = 10,
  searchText = '',
  dateRange = null,
  sortOrder = 'descend',
  clientId = null,
} = {}) => {
  const params = {
    page,
    page_size: pageSize,
  };

  if ((searchText || '').trim()) {
    params.search = searchText.trim();
  }

  if (dateRange && dateRange.length === 2 && dateRange[0] && dateRange[1]) {
    params.start_date = dateRange[0].format('YYYY-MM-DD');
    params.end_date = dateRange[1].format('YYYY-MM-DD');
  }

  const normalizedClientId =
    clientId != null && clientId !== '' ? Number(clientId) : null;

  if (normalizedClientId != null && !Number.isNaN(normalizedClientId)) {
    params.client = normalizedClientId;
  }

  if (sortOrder === 'descend') {
    params.ordering = '-decommission_time';
  } else if (sortOrder === 'ascend') {
    params.ordering = 'decommission_time';
  }

  return params;
};

export const normalizeDecommissionedDeviceList = (list = []) =>
  list.map((item) => {
    const relatedEvents = Array.isArray(item.related_events) ? item.related_events : [];
    const eventDetails = relatedEvents.map((event) => ({
      id: event.id,
      order_number: event.order_number,
      date: event.date,
      start_time: event.start_time,
      end_time: event.end_time,
      description: event.description,
      clients: event.clients || [],
      authorized_orgs: event.authorized_orgs || [],
    }));
    const latestEvent = getLatestEvent(eventDetails);

    return {
      ...item,
      key: item.id,
      decommission_time: item.decommission_time || new Date().toISOString(),
      rack_position: item.rack_position || '-',
      decommission_reason: item.decommission_reason || '-',
      order_number: item.order_number || '-',
      client_name: item.client_name || '-',
      client_authorized_person: item.client_authorized_person || '-',
      authorized_org_name: item.authorized_org_name || '-',
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
      ) || item.authorized_org_name || '-',
    };
  });
