import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { Button, T, colors } from './ui';

const checkInQrValue = 'gather:checkin';

export function QRCodeDisplay() {
  return <View style={styles.qrBox}><QRCode value={checkInQrValue} size={220} /></View>;
}

export function QRScanner({ onScan, onClose }: { onScan: () => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  if (!permission) return <View style={styles.center}><T>Checking camera access...</T></View>;
  if (!permission.granted) return <View style={[styles.center, { gap: 14 }]}>
    <T style={{ textAlign: 'center' }}>Camera access is needed to scan a check-in QR code.</T>
    <Button label="Allow camera access" onPress={requestPermission} />
    <Button label="Cancel" secondary onPress={onClose} />
  </View>;

  return <View style={styles.center}>
    <View style={styles.cameraBox}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : ({ data }) => {
          if (data !== checkInQrValue) return;
          setScanned(true);
          onScan();
        }}
      />
    </View>
    <T style={{ marginTop: 14, color: colors.muted }}>Point the camera at the check-in QR code.</T>
    <Button label="Cancel" secondary onPress={onClose} />
  </View>;
}

const styles = StyleSheet.create({
  qrBox: { alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#fff', borderRadius: 8 },
  center: { alignItems: 'center', gap: 10 },
  cameraBox: { width: 260, height: 260, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.ink },
});
