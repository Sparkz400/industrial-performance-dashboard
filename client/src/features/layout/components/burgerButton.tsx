import React from 'react';
import './burgerButton.css';

interface BurgerButtonProps {
  checked: boolean;
  onChange: () => void;
}

const BurgerButton: React.FC<BurgerButtonProps> = ({ checked, onChange }) => (
  <label className="burger" htmlFor="burger">
    <input type="checkbox" id="burger" checked={checked} onChange={onChange} />
    <span></span>
    <span></span>
    <span></span>
  </label>
);

export default BurgerButton;
