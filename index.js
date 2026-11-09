import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import App from './src/App';

if (Platform.OS === 'web') {
  const style = document.createElement('style');
  style.textContent = '*{scrollbar-width:none;-ms-overflow-style:none}*::-webkit-scrollbar{display:none}';
  document.head.appendChild(style);
}

registerRootComponent(App);