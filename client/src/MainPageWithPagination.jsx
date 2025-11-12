// components/MainPageWithPagination.jsx
import { withPagination } from './hoc/withPagination'
import { MainPage } from './MainPage'

// Обертка для MainPage с пагинацией
export const MainPageWithPagination = withPagination(MainPage, 'items')
