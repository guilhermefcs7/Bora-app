import React, { useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { catInfo, colors } from '../theme';
import type { Place } from '../types';
import { Icon } from './Icon';

/** Foto do lugar; sem foto (ou sem internet), mostra o ícone da categoria. */
export const PlacePhoto = ({
  place,
  style,
  iconSize = 72,
}: {
  place: Pick<Place, 'img' | 'cat' | 'name'>;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
}) => {
  const [failed, setFailed] = useState(false);
  const show = !!place.img && !failed;
  return (
    <View style={[{ backgroundColor: catInfo[place.cat].color, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
      {show ? (
        <Image
          source={{ uri: place.img }}
          accessibilityLabel={`Foto de ${place.name}`}
          resizeMode="cover"
          onError={() => setFailed(true)}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', height: '100%' }}
        />
      ) : (
        <Icon name={place.cat} size={iconSize} color={colors.white} stroke={1.4} />
      )}
    </View>
  );
};
