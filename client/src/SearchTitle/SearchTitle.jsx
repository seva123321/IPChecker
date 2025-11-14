import React from 'react';

export const SearchTitle = ({ type, field }) => {
  const fieldCollection = {
    ip: 'IP адресам',
    port: 'Портам',
    keyword: 'Ключевым словам',
  };

  const getHeader = () => {
    switch (type) {
      case 'group':
        return `Результаты группировки по ${fieldCollection[field].toUpperCase()}`;
      case 'search':
        return `Результаты поиска по ${fieldCollection[field].toUpperCase()}`;
      default:
        return 'Неизвестный тип отчета';
    }
  };

  return <span>{getHeader()}</span>;
};
