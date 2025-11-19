import React, { forwardRef } from 'react';
import cn from './Checkbox.module.css';

export const Checkbox = forwardRef(
  (
    {
      value,
      onChange,
      label,
      containerClass = {},
      errorMessage = '',
      ...props
    },
    ref
  ) => {
    const containerStyle = {
      width: containerClass.width,
      marginRight: containerClass.marginRight,
      position: 'relative',
      display: 'inline-block',
    };

    return (
      <div style={containerStyle} className={cn.checkboxContainer}>
        <input
          ref={ref}
          type="checkbox"
          checked={value}
          onChange={onChange}
          className={cn.checkboxInput}
          {...props}
        />
        <label htmlFor={props.id || 'defaultCheckbox'} className={cn.checkboxLabel}>
          {label}
        </label>
        {errorMessage && <div className={cn.errorText}>{errorMessage}</div>}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';