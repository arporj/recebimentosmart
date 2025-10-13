// src/components/layout/Footer.tsx
import React from 'react';

const Footer = () => {
  return (
    <footer className="bg-white shadow-sm mt-auto py-4 px-6">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-sm text-gray-600">
        <div className="flex items-center mb-2 sm:mb-0">
          <a href="https://arrc.com.br" target="_blank" rel="noopener noreferrer">
            <img 
              src="https://horizons-cdn.hostinger.com/5781d7fb-b7cc-4bb3-80b5-c52f16421b3b/045c5f7576e02237edd915ee1af176f2.png" 
              alt="ARRC Sistemas Logo" 
              className="h-8 mr-3"
            />
          </a>
          <span>
            Feito com ❤️ pela <a href="https://arrc.com.br" target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-accent-600">ARRC Sistemas</a>
          </span>
        </div>
        <div className="text-center sm:text-right">
          <p>&copy; {new Date().getFullYear()} ARRC Sistemas. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
