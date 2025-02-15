import React from 'react';
import { Modal, View, Image, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { ThemeColors } from '../utils/theme';

interface ImageModalProps {
  visible: boolean;
  image: any;
  currentTheme: ThemeColors;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({
  visible,
  image,
  currentTheme,
  onClose,
}) => {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={[styles.modalView, { backgroundColor: currentTheme.overlay }]}>
        {image && (
          <Image source={{ uri: image.uri }} style={styles.modalImage} />
        )}
        <TouchableOpacity
          style={[styles.closeButton, { backgroundColor: currentTheme.surface }]}
          onPress={onClose}
        >
          <Text style={[styles.closeButtonText, { color: currentTheme.text }]}>
            Close
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: '90%',
    height: '70%',
    borderRadius: 10,
    resizeMode: 'contain',
  },
  closeButton: {
    marginTop: 20,
    padding: 10,
    borderRadius: 5,
    minWidth: 100,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
