export type State<T> = {
  _metadata: {
    account: string;
    region: string;
  };
  _result: T;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  _parameters?: any;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export type GenericState = State<any>;
