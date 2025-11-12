import cn from './Switch.module.scss'

export function Switch({ checked, onChange, disabled = false, ...props }) {
  return (
    <label className={`${cn.switch} ${disabled ? cn.disabled : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className={cn.input}
        {...props}
      />
      <span className={cn.slider} />
    </label>
  )
}
