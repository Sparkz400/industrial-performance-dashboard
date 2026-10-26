import React from 'react';
import './burgerButton.css';

interface BurgerButtonProps {
  checked: boolean;
  onChange: () => void;
}

const BurgerButton: React.FC<BurgerButtonProps> = ({ checked, onChange }) => (
  <button
    type="button"
    className="burger"
    aria-label="Expand navigation"
    aria-expanded={checked}
    onClick={onChange}
  >
    <span></span>
    <span></span>
    <span></span>
  </button>
);

export default BurgerButton;
