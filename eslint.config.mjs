import nextVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = [
    ...nextVitals,
    {
        rules: {
            '@next/next/no-img-element': 'off',
            '@next/next/no-location-assign-relative-destination': 'off',
            'no-console': ['error', { allow: ['warn', 'error'] }],
            'react-hooks/purity': 'off',
            'react-hooks/refs': 'off',
            'react-hooks/set-state-in-effect': 'off',
        },
    },
    {
        files: ['**/*.{ts,tsx}'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
        },
    },
]

export default eslintConfig
