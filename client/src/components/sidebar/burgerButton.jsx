import React from 'react';
import './burgerButton.css';

const BurgerButton = ({ checked, onChange }) => {
    return (
        <label className="burger" htmlFor="burger">
            <input type="checkbox" id="burger" checked={checked} onChange={onChange} />
            <span></span>
            <span></span>
            <span></span>
        </label>
    );
};

export default BurgerButton;
