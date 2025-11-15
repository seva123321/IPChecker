export const renderPortsData = (data) => {
    return data
      .sort((a, b) => a.port - b.port)
      .map((item) => `${item.port} (${item.name})`)
      .join(', ');
  };