/**
 * 从常见的接口响应结构中提取列表数据。
 * 兼容 [{...}]、{ results: [...] }、{ data: [...] } 这几类返回。
 *
 * @param {Object} response
 * @returns {Array}
 */
export const extractListData = (response) => {
  const data = response?.data;

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  return [];
};

/**
 * 分页接口全量拉取工具。
 * 通过 page 逐页请求，避免解析 next URL 带来的路径兼容问题。
 *
 * @param {import('axios').AxiosInstance} request
 * @param {string} endpoint
 * @param {Object} [params={}]
 * @returns {Promise<{ data: Array }>}
 */
export const fetchAllPages = async (request, endpoint, params = {}) => {
  let page = 1;
  let hasNext = true;
  let allItems = [];

  while (hasNext) {
    const response = await request.get(endpoint, {
      params: {
        page,
        page_size: 200,
        ...params,
      },
    });

    const data = response?.data;

    if (Array.isArray(data?.results)) {
      allItems = allItems.concat(data.results);
      hasNext = Boolean(data.next);
      page += 1;
      continue;
    }

    allItems = allItems.concat(extractListData(response));
    hasNext = false;
  }

  return { data: allItems };
};
