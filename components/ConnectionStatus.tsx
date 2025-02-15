import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface ConnectionStatusProps {
  isConnected: boolean;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ isConnected }) => {
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isConnected ? "green" : "red" },
      ]}
    >
      <Text style={styles.text}>
        {isConnected ? "Connected" : "Offline"}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 5,
    alignItems: "center",
  },
  text: {
    color: "white",
  },
});
