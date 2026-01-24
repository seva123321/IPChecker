
// Filter.jsx
import { Input } from 'antd'
import useFilter from './hooks/useFilter'

const Filter = ({ items, setFiltered }) => {
  const { searchValue, handleValueChange, clearSearch } = useFilter({
    items,
    setFiltered,
  })

  return (
    <Input
      value={searchValue}
      placeholder="Поиск Группы"
      style={{ width: 200 }}
      onChange={handleValueChange}
      allowClear
      onClear={clearSearch}
    />
  )
}

export default Filter
// import { Input } from 'antd'
// import useFilter from './hooks/useFilter'

// const Filter = ({ items, setFiltered }) => {
//   const { searchValue, handleValueChange, clearSearch } = useFilter({
//     items,
//     setFiltered,
//   })

//   return (
//     <Input
//       value={searchValue}
//       placeholder="Поиск Группы"
//       style={{ width: 200 }}
//       onChange={handleValueChange}
//       // showClear
//       onClear={clearSearch}
//     />
//   )
// }

// export default Filter
